import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import logger from '../utils/logger.js';
import { OAuthServer } from './oauth/server.js';
import { createMcpServer } from './server.js';
import { HttpTransportConfig } from './transport-config.js';

/** Matches the SDK's own limit for a single JSON-RPC message. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** A session with no request for this long is closed; the client re-initializes on its next call. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const SESSION_SWEEP_INTERVAL_MS = 60 * 1000;

/** Host header names always accepted: the loopback interface under its usual names. */
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

interface Session {
    server: Server;
    transport: StreamableHTTPServerTransport;
    lastSeen: number;
}

export interface RunningHttpServer {
    /** The port actually bound, which differs from the configured one when that was 0. */
    port: number;
    close(): Promise<void>;
}

class PayloadTooLargeError extends Error {}

/**
 * Writes a JSON-RPC error response that is not tied to any request id
 * @param res HTTP response
 * @param status HTTP status code
 * @param code JSON-RPC error code
 * @param message Error message
 * @param headers Extra response headers
 */
function sendJsonRpcError(
    res: ServerResponse,
    status: number,
    code: number,
    message: string,
    headers: Record<string, string> = {}
) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/**
 * Reads and parses a JSON request body
 * @param req HTTP request
 * @returns Parsed body
 * @throws PayloadTooLargeError past MAX_BODY_BYTES, SyntaxError on malformed JSON
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            throw new PayloadTooLargeError();
        }
        chunks.push(chunk);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Checks the Host header against loopback and the configured public names.
 * This is the DNS rebinding defence: a hostile web page that rebinds its own
 * name to 127.0.0.1 still sends that name, not one of these, as Host.
 *
 * Same port-agnostic hostname match as the SDK's `hostHeaderValidation()`, which
 * is Express middleware. The transport's own `allowedHosts` option is not used: it
 * is deprecated, matches the raw header including the port, and runs only inside
 * `handleRequest()`, after a session has already been created.
 * @param req HTTP request
 * @param allowedHostnames Accepted hostnames, lower case, without port
 * @returns Whether the request may proceed
 */
function isAllowedHost(req: IncomingMessage, allowedHostnames: Set<string>): boolean {
    const hostHeader = req.headers.host;
    if (!hostHeader) {
        return false;
    }

    try {
        return allowedHostnames.has(new URL(`http://${hostHeader}`).hostname.toLowerCase());
    } catch {
        return false;
    }
}

/**
 * Validates the Origin header, as the MCP Streamable HTTP spec requires servers to.
 * Browsers attach Origin to cross-origin requests; native clients (desktop apps,
 * CLIs, server-side connectors) send none, so a missing Origin is accepted. A
 * present one must be listed, and an opaque `null` origin never is.
 * @param req HTTP request
 * @param allowedOrigins Accepted serialized origins
 * @returns Whether the request may proceed
 */
function isAllowedOrigin(req: IncomingMessage, allowedOrigins: Set<string>): boolean {
    const originHeader = req.headers.origin;
    if (originHeader === undefined) {
        return true;
    }

    try {
        return allowedOrigins.has(new URL(originHeader).origin);
    } catch {
        return false;
    }
}

/**
 * Extracts the bearer token from the Authorization header
 * @param req HTTP request
 * @returns The token, or undefined when there is no well-formed Bearer header
 */
function bearerToken(req: IncomingMessage): string | undefined {
    const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(req.headers.authorization || '');
    return match?.[1];
}

/**
 * Compares a bearer token with the configured static one in constant time
 * @param token Presented token
 * @param expectedDigest SHA-256 of the configured token
 * @returns Whether they match
 */
function matchesStaticToken(token: string, expectedDigest: Buffer): boolean {
    // Hashing first gives both sides the same length, which timingSafeEqual requires.
    const presentedDigest = createHash('sha256').update(token).digest();
    return timingSafeEqual(presentedDigest, expectedDigest);
}

/**
 * Starts the Streamable HTTP transport.
 *
 * Routes:
 * - `POST|GET|DELETE /mcp` — MCP Streamable HTTP, one SDK server per session
 * - `GET|HEAD /healthz` — liveness only; no auth, no data
 * @param config HTTP transport configuration
 * @returns Handle exposing the bound port and a graceful close
 * @throws Error when neither an auth token nor the explicit no-auth opt-out is configured
 */
export async function startHttpServer(config: HttpTransportConfig): Promise<RunningHttpServer> {
    // Checked here as well as in loadTransportConfig, so no caller can start an open server by accident.
    if (!config.authToken && !config.oauth && !config.allowNoAuth) {
        throw new Error('Refusing to serve /mcp without MCP_AUTH_TOKEN, OAuth, or MCP_ALLOW_NO_AUTH=true');
    }

    const oauth = config.oauth ? await OAuthServer.create(config.oauth, config.trustProxy) : undefined;

    const sessions = new Map<string, Session>();
    const allowedHostnames = new Set([...LOOPBACK_HOSTNAMES, ...config.allowedHosts]);
    const allowedOrigins = new Set(config.allowedOrigins);
    const expectedDigest = config.authToken
        ? createHash('sha256').update(config.authToken).digest()
        : null;

    const closeSession = async (sessionId: string, reason: string) => {
        const session = sessions.get(sessionId);
        if (!session) {
            return;
        }
        sessions.delete(sessionId);
        logger.info('MCP session closed', { sessionId, reason });
        try {
            await session.server.close();
        } catch (error) {
            logger.warn('Error closing MCP session', {
                sessionId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const handleMcp = async (req: IncomingMessage, res: ServerResponse) => {
        if (!isAllowedOrigin(req, allowedOrigins)) {
            sendJsonRpcError(res, 403, -32000, 'Forbidden: Origin not allowed');
            return;
        }

        if (expectedDigest || oauth) {
            const token = bearerToken(req);
            const authorized =
                token !== undefined &&
                ((expectedDigest !== null && matchesStaticToken(token, expectedDigest)) ||
                    (oauth !== undefined && oauth.verifyAccessToken(token)));
            if (!authorized) {
                // With OAuth on, the challenge points clients at discovery so they can sign in.
                const challenge = oauth ? oauth.challenge(token !== undefined) : 'Bearer';
                sendJsonRpcError(res, 401, -32001, 'Unauthorized', { 'WWW-Authenticate': challenge });
                return;
            }
        }

        const sessionHeader = req.headers['mcp-session-id'];
        const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

        let body: unknown;
        if (req.method === 'POST') {
            try {
                body = await readJsonBody(req);
            } catch (error) {
                if (error instanceof PayloadTooLargeError) {
                    sendJsonRpcError(res, 413, -32600, 'Request body too large', { Connection: 'close' });
                } else {
                    sendJsonRpcError(res, 400, -32700, 'Parse error');
                }
                return;
            }
        } else if (req.method !== 'GET' && req.method !== 'DELETE') {
            sendJsonRpcError(res, 405, -32000, 'Method not allowed', { Allow: 'GET, POST, DELETE' });
            return;
        }

        if (sessionId) {
            const session = sessions.get(sessionId);
            if (!session) {
                // The spec's signal for "start a new session"; clients re-initialize on it.
                sendJsonRpcError(res, 404, -32001, 'Session not found');
                return;
            }
            session.lastSeen = Date.now();
            await session.transport.handleRequest(req, res, body);
            return;
        }

        if (req.method !== 'POST' || !isInitializeRequest(body)) {
            sendJsonRpcError(res, 400, -32000, 'Bad Request: no valid session ID provided');
            return;
        }

        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
                sessions.set(newSessionId, { server, transport, lastSeen: Date.now() });
                logger.info('MCP session opened', { sessionId: newSessionId, sessions: sessions.size });
            },
        });
        // Set before connect(): the SDK chains its own close handling onto this one.
        transport.onclose = () => {
            const closedId = transport.sessionId;
            if (closedId && sessions.delete(closedId)) {
                logger.info('MCP session closed', { sessionId: closedId, reason: 'transport closed' });
            }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, body);
    };

    const httpServer = createServer(async (req, res) => {
        try {
            if (!isAllowedHost(req, allowedHostnames)) {
                sendJsonRpcError(res, 403, -32000, 'Forbidden: Host not allowed');
                return;
            }

            let path: string;
            try {
                path = new URL(req.url || '/', 'http://localhost').pathname;
            } catch {
                // Node accepts absolute-form targets such as `GET http://x:99999/` that the URL
                // parser rejects. That's the client's mistake (usually a scanner), so answer
                // 400 and don't log it as a server error.
                sendJsonRpcError(res, 400, -32600, 'Bad Request: malformed request target');
                return;
            }

            if (path === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
                return;
            }

            if (path === '/mcp') {
                await handleMcp(req, res);
                return;
            }

            if (oauth?.handles(path)) {
                // Clients call the token and revocation endpoints server-side, without Origin;
                // a browser page gets the same Origin rule as /mcp. The sign-in form checks
                // its own Origin.
                if ((path === '/oauth/token' || path === '/oauth/revoke') && !isAllowedOrigin(req, allowedOrigins)) {
                    sendJsonRpcError(res, 403, -32000, 'Forbidden: Origin not allowed');
                    return;
                }
                await oauth.handle(req, res, path);
                return;
            }

            sendJsonRpcError(res, 404, -32000, 'Not found');
        } catch (error) {
            logger.error('Error handling HTTP request', {
                method: req.method,
                message: error instanceof Error ? error.message : String(error),
            });
            if (!res.headersSent) {
                sendJsonRpcError(res, 500, -32603, 'Internal server error');
            } else {
                res.end();
            }
        }
    });

    const sweep = setInterval(() => {
        const cutoff = Date.now() - SESSION_IDLE_TIMEOUT_MS;
        for (const [sessionId, session] of sessions) {
            if (session.lastSeen < cutoff) {
                void closeSession(sessionId, 'idle');
            }
        }
    }, SESSION_SWEEP_INTERVAL_MS);
    sweep.unref();

    await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.port, config.host, () => {
            httpServer.off('error', reject);
            resolve();
        });
    });

    const address = httpServer.address();
    const port = typeof address === 'object' && address !== null ? address.port : config.port;

    logger.info('Toshl MCP server listening (Streamable HTTP)', {
        host: config.host,
        port,
        path: '/mcp',
        bearerAuth: expectedDigest !== null,
        oauth: oauth !== undefined,
        allowedHosts: [...allowedHostnames],
        allowedOrigins: [...allowedOrigins],
    });

    if (!expectedDigest && !oauth) {
        // Error level so no LOG_LEVEL setting short of silence can hide it.
        logger.error(
            'SECURITY WARNING: /mcp is serving WITHOUT authentication (MCP_ALLOW_NO_AUTH=true). Anything ' +
                'that can reach this port can read and change the Toshl account. This is only safe behind ' +
                'a proxy that enforces authentication on every request.',
            { host: config.host, port }
        );
    }

    return {
        port,
        close: async () => {
            clearInterval(sweep);
            await Promise.all([...sessions.keys()].map((sessionId) => closeSession(sessionId, 'shutdown')));
            await new Promise<void>((resolve) => {
                httpServer.close(() => resolve());
                // Ends idle keep-alive sockets and any SSE stream left open.
                httpServer.closeAllConnections();
            });
        },
    };
}
