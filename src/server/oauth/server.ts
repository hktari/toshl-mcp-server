import { IncomingMessage, ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import logger from '../../utils/logger.js';
import { OAuthConfig } from '../transport-config.js';
import { findClient, isRegisteredRedirectUri, OAuthClient } from './clients.js';
import { deriveKey, randomToken, safeEqual, sha256, signPayload, verifyPayload } from './crypto.js';
import { sendErrorPage, sendSignInPage } from './page.js';
import { DEFAULT_LOCKOUT_POLICY, PERSONAL_TOKEN_LOCKOUT_POLICY, rateLimitKey, RequestLimiter, SignInLimiter } from './rate-limit.js';
import { RefreshTokenStore } from './refresh-store.js';
import {
    InvalidPersonalTokenError,
    personalTokenRecord,
    personalTokenUserId,
    TOSHL_AUTHORIZE_URL,
    TOSHL_TOKEN_URL,
    ToshlOAuthClient,
    ToshlTokenStore,
} from './toshl-auth.js';

/** How the users of a multi-user server prove who they are to Toshl. */
interface ToshlMode {
    tokens: ToshlTokenStore;
    /** Sign in with Toshl (OAuth). Undefined in personal-token mode. */
    client?: ToshlOAuthClient;
}
import { RequestUser } from '../request-context.js';

/** Access tokens are stateless, so this is also how long one outlives a revocation. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/** Authorization codes are single-use and short-lived (RFC 6749 recommends at most 10 minutes). */
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;

/** How long the sign-in page stays valid before the client has to start over. */
export const SIGN_IN_FORM_TTL_MS = 10 * 60 * 1000;

/** Added to every wrong passphrase, on top of the lockout. */
export const FAILED_SIGN_IN_DELAY_MS = 500;

/** The only scope: full read and write access to the Toshl account. */
export const SCOPE = 'toshl';

/** Accepted when requested, and ignored: refresh tokens are always issued. */
const IGNORED_SCOPES = new Set(['offline_access']);

/** How long a trip to Toshl's sign-in page may take before the user has to start over. */
export const TOSHL_SIGN_IN_TTL_MS = 10 * 60 * 1000;

/** Binds a Toshl sign-in to the browser that started it, so a stolen state value is useless. */
const SIGN_IN_COOKIE = '__Host-toshl_sign_in';

const MAX_PENDING_TOSHL_SIGN_INS = 1000;

/** The subject of tokens issued in single-user mode. */
const OWNER = 'owner';

const MAX_FORM_BYTES = 16 * 1024;
const MAX_PENDING_CODES = 1000;

/** Sign-ins (refresh families) kept per user; older ones are revoked. */
export const MAX_SIGN_INS_PER_USER = 20;

/** Successful connections per user per minute, so one account can't churn codes and records. */
const SIGN_INS_PER_USER_PER_MINUTE = 10;

/** RFC 7636: 43-128 characters from the unreserved set. */
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url SHA-256, the only challenge accepted. */
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

const OAUTH_PATHS = new Set([
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-authorization-server',
    '/oauth/authorize',
    '/oauth/token',
    '/oauth/revoke',
    '/oauth/toshl/callback',
]);

interface AuthorizationRequest {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    state?: string;
    /** Who signed in: a Toshl user id, or the owner in single-user mode. */
    sub?: string;
}

interface PendingToshlSignIn {
    request: AuthorizationRequest;
    clientName: string;
    expiresAt: number;
    /** SHA-256 of the cookie value set on the browser that started this sign-in. */
    browser: string;
}

interface PendingCode extends AuthorizationRequest {
    expiresAt: number;
    /** Set by the first exchange attempt; any later one is a replay. */
    consumed?: boolean;
    /** Refresh family the first exchange issued, revoked if the code is replayed. */
    usedFamilyId?: string;
    /** A replay arrived while the first exchange was still issuing. */
    replayed?: boolean;
}

class FormTooLargeError extends Error {}

/**
 * Reads one cookie from the request
 * @param req HTTP request
 * @param name Cookie name
 * @returns Its value, or undefined
 */
function readCookie(req: IncomingMessage, name: string): string | undefined {
    for (const part of (req.headers.cookie ?? '').split(';')) {
        const index = part.indexOf('=');
        if (index > 0 && part.slice(0, index).trim() === name) {
            return part.slice(index + 1).trim();
        }
    }
    return undefined;
}

/**
 * Reads a request body up to a limit
 * @param req HTTP request
 * @param limit Maximum bytes
 * @returns Body text
 */
async function readBody(req: IncomingMessage, limit: number): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) {
            throw new FormTooLargeError();
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/**
 * Collects single-valued parameters. A repeated parameter makes the whole request invalid
 * (RFC 6749 section 3.1), which closes off parameter-pollution tricks.
 * @param params Parsed parameters
 * @returns Parameter map, or undefined when any parameter repeats
 */
function singleValued(params: URLSearchParams): Map<string, string> | undefined {
    const result = new Map<string, string>();
    for (const [key, value] of params) {
        if (result.has(key)) {
            return undefined;
        }
        result.set(key, value);
    }
    return result;
}

/**
 * Canonical form of a resource indicator: lower-case scheme and host, no default port,
 * no trailing slash, no fragment (RFC 8707, as Claude sends it)
 * @param value resource parameter
 * @returns Canonical URI, or undefined when it isn't an absolute URI without a fragment
 */
function canonicalResource(value: string): string | undefined {
    try {
        const url = new URL(value);
        if (url.hash || url.username || url.password) {
            return undefined;
        }
        return `${url.origin}${url.pathname.replace(/\/+$/, '')}${url.search}`;
    } catch {
        return undefined;
    }
}

/**
 * Parses a requested scope
 * @param value scope parameter
 * @returns The granted scope, or undefined when an unknown scope was asked for
 */
function parseScope(value: string | undefined): string | undefined {
    const requested = (value ?? '').split(' ').filter((item) => item.length > 0);
    return requested.every((item) => item === SCOPE || IGNORED_SCOPES.has(item)) ? SCOPE : undefined;
}

/**
 * Writes a JSON response that must never be cached (RFC 6749 section 5.1)
 * @param res HTTP response
 * @param status HTTP status
 * @param body Response body
 * @param headers Extra headers
 */
function sendJson(res: ServerResponse, status: number, body: object, headers: Record<string, string> = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...headers,
    });
    res.end(JSON.stringify(body));
}

/**
 * Writes an OAuth error response for the token and revocation endpoints
 * @param res HTTP response
 * @param status HTTP status
 * @param error RFC 6749 error code
 * @param description Human-readable detail; never includes a secret
 */
function sendOAuthError(res: ServerResponse, status: number, error: string, description: string) {
    sendJson(res, status, { error, error_description: description });
}

/**
 * Built-in OAuth 2.1 authorization server plus the protected-resource side of `/mcp`.
 *
 * One user, two pinned public clients (Claude and Claude Code), one scope. Approval is a
 * passphrase. Access tokens are signed and stateless; refresh tokens rotate and are stored
 * as hashes, so both survive restarts as long as the signing key and state directory do.
 */
export class OAuthServer {
    readonly issuer: string;
    readonly resource: string;
    private readonly accessKeys: Buffer[];
    private readonly formKeys: Buffer[];
    private readonly compareKey: Buffer;
    private readonly codes = new Map<string, PendingCode>();
    private readonly toshlSignIns = new Map<string, PendingToshlSignIn>();
    private readonly signInLimiter: SignInLimiter;
    private readonly tokenLimiter = new RequestLimiter(30);
    private readonly authorizeLimiter = new RequestLimiter(60);
    private readonly userSignInLimiter = new RequestLimiter(SIGN_INS_PER_USER_PER_MINUTE);

    private constructor(
        private readonly config: OAuthConfig,
        private readonly trustProxy: boolean,
        private readonly clientIpHeader: string | undefined,
        private readonly store: RefreshTokenStore,
        private readonly toshl?: ToshlMode
    ) {
        this.signInLimiter = new SignInLimiter(config.personalTokens ? PERSONAL_TOKEN_LOCKOUT_POLICY : DEFAULT_LOCKOUT_POLICY);
        this.issuer = config.publicUrl;
        this.resource = `${config.publicUrl}/mcp`;

        const secrets = [config.signingKey, ...(config.previousSigningKey ? [config.previousSigningKey] : [])];
        this.accessKeys = secrets.map((secret) => deriveKey(secret, 'access-token'));
        this.formKeys = secrets.map((secret) => deriveKey(secret, 'sign-in-form'));
        this.compareKey = deriveKey(config.signingKey, 'passphrase-compare');
    }

    /**
     * Creates the OAuth server and opens its refresh-token store
     * @param config OAuth configuration
     * @param trustProxy Whether X-Forwarded-For carries the client IP
     * @returns The OAuth server
     */
    static async create(config: OAuthConfig, trustProxy: boolean, clientIpHeader?: string): Promise<OAuthServer> {
        const store = await RefreshTokenStore.open(config.stateDir);
        let toshl: ToshlMode | undefined;
        if (config.personalTokens) {
            const tokens = await ToshlTokenStore.open(config.stateDir, config.signingKey, config.previousSigningKey, undefined);
            toshl = { tokens };
        } else if (config.toshl) {
            const client = new ToshlOAuthClient(
                config.toshl,
                undefined,
                config.toshl.tokenUrl ?? TOSHL_TOKEN_URL,
                config.toshl.authorizeUrl ?? TOSHL_AUTHORIZE_URL
            );
            const tokens = await ToshlTokenStore.open(config.stateDir, config.signingKey, config.previousSigningKey, client);
            toshl = { client, tokens };
        }
        logger.info('OAuth enabled', {
            issuer: config.publicUrl,
            signIn: config.personalTokens ? 'personal-token' : toshl ? 'toshl' : 'passphrase',
            storedRefreshTokens: store.size,
        });
        return new OAuthServer(config, trustProxy, clientIpHeader, store, toshl);
    }

    /** Whether each user signs in with their own Toshl account (multi-user mode) */
    get multiUser(): boolean {
        return this.toshl !== undefined;
    }

    /**
     * The request user for a token subject in multi-user mode
     * @param sub Subject from a verified access token
     * @returns The user, or undefined when they are no longer connected to Toshl
     */
    toshlUser(sub: string): RequestUser | undefined {
        if (!this.toshl || !this.toshl.tokens.has(sub)) {
            return undefined;
        }
        const tokens = this.toshl.tokens;
        return {
            userId: sub,
            getAuthorization: () => tokens.authorization(sub),
            revoke: async (usedAuthorization: string) => {
                if (await tokens.handleUnauthorized(sub, usedAuthorization)) {
                    logger.info('Toshl refused a user\'s credentials; disconnected them');
                }
            },
        };
    }

    /**
     * @param path Request path
     * @returns Whether the path is one of the OAuth endpoints
     */
    handles(path: string): boolean {
        return OAUTH_PATHS.has(path);
    }

    /**
     * The 401 challenge for `/mcp`, pointing clients at the discovery metadata (RFC 9728)
     * @param tokenPresented Whether the request carried a bearer token that failed
     * @returns WWW-Authenticate header value
     */
    challenge(tokenPresented: boolean): string {
        const parts = [
            `Bearer resource_metadata="${this.issuer}/.well-known/oauth-protected-resource/mcp"`,
            `scope="${SCOPE}"`,
        ];
        if (tokenPresented) {
            parts.push('error="invalid_token"');
        }
        return parts.join(', ');
    }

    /**
     * Checks an access token presented to `/mcp`: signature, issuer, audience, expiry, scope
     * @param token Bearer token
     * @returns Whether it grants access
     */
    verifyAccessToken(token: string): boolean {
        return this.accessTokenSubject(token) !== undefined;
    }

    /**
     * Checks an access token like verifyAccessToken and says whose it is
     * @param token Bearer token
     * @returns The subject (a Toshl user id, or "owner"), or undefined when it grants nothing
     */
    accessTokenSubject(token: string): string | undefined {
        const claims = verifyPayload(this.accessKeys, token);
        const valid =
            claims !== undefined &&
            claims.typ === 'access' &&
            claims.iss === this.issuer &&
            claims.aud === this.resource &&
            typeof claims.exp === 'number' &&
            claims.exp > Math.floor(Date.now() / 1000) &&
            typeof claims.scope === 'string' &&
            claims.scope.split(' ').includes(SCOPE) &&
            (claims.sub === undefined || typeof claims.sub === 'string');
        if (!valid) {
            return undefined;
        }
        // Tokens have always named their subject; a missing one can only mean the single owner.
        const sub = (claims.sub as string | undefined) ?? OWNER;
        // A single-user token can't open a multi-user server, and the other way round.
        if (this.multiUser === (sub === OWNER)) {
            return undefined;
        }
        return sub;
    }

    /**
     * Routes a request to an OAuth endpoint; call only when `handles(path)` is true
     * @param req HTTP request
     * @param res HTTP response
     * @param path Request path
     */
    async handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
        if (path.startsWith('/.well-known/')) {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                sendOAuthError(res, 405, 'invalid_request', 'Method not allowed');
                return;
            }
            sendJson(
                res,
                200,
                path === '/.well-known/oauth-authorization-server'
                    ? this.authorizationServerMetadata()
                    : this.protectedResourceMetadata()
            );
            return;
        }

        if (path === '/oauth/toshl/callback') {
            if (req.method === 'GET' && this.toshl?.client) {
                await this.toshlCallback(req, res);
            } else {
                sendErrorPage(res, 404, 'Not found.');
            }
            return;
        }

        if (path === '/oauth/authorize') {
            if (req.method === 'GET') {
                await this.authorizeGet(req, res);
            } else if (req.method === 'POST') {
                await this.authorizePost(req, res);
            } else {
                sendErrorPage(res, 405, 'Method not allowed.');
            }
            return;
        }

        if (req.method !== 'POST') {
            sendOAuthError(res, 405, 'invalid_request', 'Method not allowed');
            return;
        }

        if (!this.tokenLimiter.allow(this.clientIp(req))) {
            sendOAuthError(res, 429, 'temporarily_unavailable', 'Too many requests');
            return;
        }

        const params = await this.readForm(req, res);
        if (!params) {
            return;
        }

        if (path === '/oauth/token') {
            await this.token(req, res, params);
        } else {
            await this.revoke(res, params);
        }
    }

    private protectedResourceMetadata() {
        return {
            resource: this.resource,
            authorization_servers: [this.issuer],
            scopes_supported: [SCOPE],
            bearer_methods_supported: ['header'],
            resource_name: 'Toshl Finance',
        };
    }

    private authorizationServerMetadata() {
        return {
            issuer: this.issuer,
            authorization_endpoint: `${this.issuer}/oauth/authorize`,
            token_endpoint: `${this.issuer}/oauth/token`,
            revocation_endpoint: `${this.issuer}/oauth/revoke`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            // Public clients only; with this and the flag below, Claude uses its published
            // client identity instead of dynamic registration, which isn't offered.
            token_endpoint_auth_methods_supported: ['none'],
            revocation_endpoint_auth_methods_supported: ['none'],
            client_id_metadata_document_supported: true,
            code_challenge_methods_supported: ['S256'],
            scopes_supported: [SCOPE],
            authorization_response_iss_parameter_supported: true,
        };
    }

    /**
     * Client address for rate limiting and logs. Behind a trusted proxy it's the header the
     * proxy overwrites with the client address (MCP_CLIENT_IP_HEADER, e.g. Railway's X-Real-IP),
     * or else the last X-Forwarded-For entry. Behind Railway the last entry is one of Railway's
     * own hops, which changes per request and makes every per-IP limit useless, so set the
     * header there. Anything that isn't an IP falls back to the socket's. IPv6 is keyed by /48.
     * @param req HTTP request
     * @returns Rate-limit key
     */
    private clientIp(req: IncomingMessage): string {
        if (this.trustProxy && this.clientIpHeader) {
            const raw = req.headers[this.clientIpHeader];
            const fromHeader = rateLimitKey(Array.isArray(raw) ? raw[0] : raw);
            if (fromHeader) {
                return fromHeader;
            }
        }
        if (this.trustProxy) {
            const header = req.headers['x-forwarded-for'];
            const value = Array.isArray(header) ? header[header.length - 1] : header;
            const forwarded = rateLimitKey(value?.split(',').pop());
            if (forwarded) {
                return forwarded;
            }
        }
        return rateLimitKey(req.socket.remoteAddress) ?? 'unknown';
    }

    /**
     * Reads a form-encoded body for the token and revocation endpoints
     * @returns Parameters, or undefined after an error response has been sent
     */
    private async readForm(req: IncomingMessage, res: ServerResponse): Promise<Map<string, string> | undefined> {
        const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (contentType !== 'application/x-www-form-urlencoded') {
            sendOAuthError(res, 400, 'invalid_request', 'Body must be application/x-www-form-urlencoded');
            return undefined;
        }

        let body: string;
        try {
            body = await readBody(req, MAX_FORM_BYTES);
        } catch (error) {
            if (error instanceof FormTooLargeError) {
                sendOAuthError(res, 413, 'invalid_request', 'Request body too large');
                return undefined;
            }
            throw error;
        }

        const params = singleValued(new URLSearchParams(body));
        if (!params) {
            sendOAuthError(res, 400, 'invalid_request', 'A parameter was repeated');
        }
        return params;
    }

    /**
     * Validates an authorization request. Problems with the client or redirect URI are shown
     * on an error page; anything else is reported back to the (now trusted) redirect URI.
     * @returns The validated request, or undefined after a response has been sent
     */
    private validateAuthorizationRequest(
        res: ServerResponse,
        params: Map<string, string> | undefined
    ): { request: AuthorizationRequest; client: OAuthClient } | undefined {
        if (!params) {
            sendErrorPage(res, 400, 'The sign-in request repeats a parameter.');
            return undefined;
        }

        const client = findClient(params.get('client_id'));
        if (!client) {
            sendErrorPage(res, 400, 'This application is not allowed to connect to this server.');
            return undefined;
        }

        const redirectUri = params.get('redirect_uri');
        if (!redirectUri || !isRegisteredRedirectUri(client, redirectUri)) {
            sendErrorPage(res, 400, 'The sign-in request has a return address this server does not accept.');
            return undefined;
        }

        const state = params.get('state');
        const fail = (error: string, description: string) => {
            this.redirectWithParams(res, redirectUri, { error, error_description: description, state });
            return undefined;
        };

        if (params.get('response_type') !== 'code') {
            return fail('unsupported_response_type', 'Only response_type=code is supported');
        }
        const codeChallenge = params.get('code_challenge');
        if (params.get('code_challenge_method') !== 'S256' || !codeChallenge || !S256_CHALLENGE.test(codeChallenge)) {
            return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
        }
        const scope = parseScope(params.get('scope'));
        if (!scope) {
            return fail('invalid_scope', `The only scope is "${SCOPE}"`);
        }
        const resource = params.get('resource');
        if (resource !== undefined && canonicalResource(resource) !== this.resource) {
            return fail('invalid_target', `The resource must be ${this.resource}`);
        }

        return { request: { clientId: client.clientId, redirectUri, codeChallenge, scope, state }, client };
    }

    private async authorizeGet(req: IncomingMessage, res: ServerResponse) {
        if (!this.authorizeLimiter.allow(this.clientIp(req))) {
            sendErrorPage(res, 429, 'Too many requests. Wait a minute and try again.');
            return;
        }

        const url = new URL(req.url ?? '/', this.issuer);
        const validated = this.validateAuthorizationRequest(res, singleValued(url.searchParams));
        if (!validated) {
            return;
        }

        this.showSignIn(res, 200, validated.client, validated.request, {
            retryAfterSeconds: this.signInLimiter.retryAfterSeconds(this.clientIp(req)),
        });
    }

    private async authorizePost(req: IncomingMessage, res: ServerResponse) {
        const ip = this.clientIp(req);
        if (!this.authorizeLimiter.allow(ip)) {
            sendErrorPage(res, 429, 'Too many requests. Wait a minute and try again.');
            return;
        }

        // A cross-site form post would carry the attacker's origin. Browsers send Origin on
        // every POST, but serialize it as "null" under some referrer policies; then the
        // browser-set Sec-Fetch-Site header must vouch that the post came from this site.
        const origin = req.headers.origin;
        const sameSite =
            origin === this.issuer ||
            ((origin === undefined || origin === 'null') && req.headers['sec-fetch-site'] === 'same-origin');
        if (!sameSite) {
            sendErrorPage(res, 403, 'The sign-in form was submitted from another site.');
            return;
        }

        const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        let body: string;
        try {
            body = contentType === 'application/x-www-form-urlencoded' ? await readBody(req, MAX_FORM_BYTES) : '';
        } catch (error) {
            if (error instanceof FormTooLargeError) {
                sendErrorPage(res, 413, 'The sign-in form was too large.');
                return;
            }
            throw error;
        }
        const form = singleValued(new URLSearchParams(body));

        const claims = form?.get('request') ? verifyPayload(this.formKeys, form.get('request') as string) : undefined;
        if (!form || !claims || claims.typ !== 'sign-in' || typeof claims.exp !== 'number' || claims.exp <= Date.now()) {
            sendErrorPage(res, 400, 'This sign-in page has expired.');
            return;
        }

        // Re-check against the pinned clients, in case the request was signed by an older release.
        const client = findClient(claims.client_id as string);
        const request: AuthorizationRequest = {
            clientId: claims.client_id as string,
            redirectUri: claims.redirect_uri as string,
            codeChallenge: claims.code_challenge as string,
            scope: claims.scope as string,
            state: claims.state as string | undefined,
        };
        if (!client || !isRegisteredRedirectUri(client, request.redirectUri)) {
            sendErrorPage(res, 400, 'This application is not allowed to connect to this server.');
            return;
        }

        if (form.get('action') === 'deny') {
            logger.info('OAuth sign-in cancelled', { clientId: client.clientId, ip });
            this.redirectWithParams(res, request.redirectUri, {
                error: 'access_denied',
                error_description: 'The user cancelled the sign-in',
                state: request.state,
            });
            return;
        }

        if (this.toshl?.client) {
            // Consent given on our page; the Toshl sign-in is the authentication.
            this.startToshlSignIn(res, client, request);
            return;
        }
        if (this.toshl) {
            await this.personalTokenSignIn(res, ip, client, request, form.get('toshl_token') ?? '');
            return;
        }

        const retryAfterSeconds = this.signInLimiter.retryAfterSeconds(ip);
        if (retryAfterSeconds > 0) {
            this.showSignIn(res, 429, client, request, { retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
            return;
        }

        if (!safeEqual(this.compareKey, form.get('passphrase') ?? '', this.config.passphrase ?? '')) {
            const { ipLocked, globalLocked } = this.signInLimiter.recordFailure(ip);
            logger.warn('OAuth sign-in failed: wrong passphrase', { clientId: client.clientId, ip });
            if (ipLocked || globalLocked) {
                logger.warn('OAuth sign-in locked out', { ip, scope: globalLocked ? 'all clients' : 'this IP' });
            }
            await sleep(FAILED_SIGN_IN_DELAY_MS);
            this.showSignIn(res, 401, client, request, {
                error: 'Wrong passphrase.',
                retryAfterSeconds: this.signInLimiter.retryAfterSeconds(ip),
            });
            return;
        }

        this.signInLimiter.recordSuccess(ip);
        const code = this.createCode({ ...request, sub: OWNER });
        logger.info('OAuth sign-in approved', { clientId: client.clientId, ip });
        this.redirectWithParams(res, request.redirectUri, { code, state: request.state });
    }

    /**
     * Sends the browser to Toshl's sign-in. The validated request waits here, keyed by a random
     * state (Toshl cuts state at 255 characters, too short to carry the request signed), and is
     * tied to this browser by a cookie.
     */
    private startToshlSignIn(res: ServerResponse, client: OAuthClient, request: AuthorizationRequest) {
        const toshl = this.toshl as Required<ToshlMode>;
        const now = Date.now();
        for (const [key, pending] of this.toshlSignIns) {
            if (pending.expiresAt <= now) {
                this.toshlSignIns.delete(key);
            }
        }
        if (this.toshlSignIns.size >= MAX_PENDING_TOSHL_SIGN_INS) {
            const oldest = this.toshlSignIns.keys().next().value;
            if (oldest !== undefined) {
                this.toshlSignIns.delete(oldest);
            }
        }

        const state = randomToken(32);
        const browser = randomToken(32);
        this.toshlSignIns.set(sha256(state), {
            request,
            clientName: client.clientName,
            expiresAt: now + TOSHL_SIGN_IN_TTL_MS,
            browser: sha256(browser),
        });

        res.writeHead(303, {
            Location: toshl.client.authorizeRedirect(this.toshlRedirectUri(), state),
            'Set-Cookie': `${SIGN_IN_COOKIE}=${browser}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${TOSHL_SIGN_IN_TTL_MS / 1000}`,
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
        });
        res.end();
    }

    private toshlRedirectUri(): string {
        return `${this.issuer}/oauth/toshl/callback`;
    }

    /**
     * Toshl sends the browser back here. The code is exchanged at once (Toshl codes live 30
     * seconds), the user's tokens are stored, and Claude gets our own authorization code.
     */
    private async toshlCallback(req: IncomingMessage, res: ServerResponse) {
        const toshl = this.toshl as Required<ToshlMode>;
        const ip = this.clientIp(req);
        if (!this.authorizeLimiter.allow(ip)) {
            sendErrorPage(res, 429, 'Too many requests. Wait a minute and try again.');
            return;
        }

        const url = new URL(req.url ?? '/', this.issuer);
        const params = singleValued(url.searchParams);
        const state = params?.get('state');
        const pending = state ? this.toshlSignIns.get(sha256(state)) : undefined;

        if (!params || !state || !pending || pending.expiresAt <= Date.now()) {
            sendErrorPage(res, 400, 'This sign-in has expired. Go back to Claude and connect again.');
            return;
        }
        // The browser check comes before the state is spent, so someone who learns a state
        // value can't use it to break the real user's sign-in.
        const cookie = readCookie(req, SIGN_IN_COOKIE);
        if (cookie === undefined || sha256(cookie) !== pending.browser) {
            logger.warn('Toshl sign-in returned to a different browser', { ip });
            sendErrorPage(res, 400, 'This sign-in was started in another browser. Go back to Claude and connect again.');
            return;
        }
        // Single use from here on, whatever happens next.
        this.toshlSignIns.delete(sha256(state));
        res.setHeader('Set-Cookie', `${SIGN_IN_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);

        const { request } = pending;
        const error = params.get('error');
        if (error !== undefined) {
            logger.info('Toshl sign-in declined', { error, clientId: request.clientId });
            this.redirectWithParams(res, request.redirectUri, {
                error: 'access_denied',
                error_description: 'Access to Toshl was not granted',
                state: request.state,
            });
            return;
        }

        const toshlCode = params.get('code');
        if (!toshlCode) {
            sendErrorPage(res, 400, 'Toshl did not send a sign-in code. Go back to Claude and connect again.');
            return;
        }

        let userId: string;
        try {
            const tokens = await toshl.client.exchangeCode(toshlCode, this.toshlRedirectUri());
            userId = await toshl.client.userId(tokens.accessToken);
            await toshl.tokens.save(userId, tokens);
        } catch (failure) {
            logger.error('Toshl sign-in failed', {
                message: failure instanceof Error ? failure.message : String(failure),
                clientId: request.clientId,
            });
            sendErrorPage(res, 502, 'Signing in to Toshl failed. Go back to Claude and try connecting again.');
            return;
        }

        const code = this.createCode({ ...request, sub: userId });
        logger.info('Toshl sign-in approved', { clientId: request.clientId });
        this.redirectWithParams(res, request.redirectUri, { code, state: request.state });
    }

    /**
     * Personal-token mode: checks the pasted token against Toshl, stores it for the user it
     * belongs to and hands Claude our code. Wrong tokens count towards the sign-in lockout.
     */
    private async personalTokenSignIn(
        res: ServerResponse,
        ip: string,
        client: OAuthClient,
        request: AuthorizationRequest,
        pasted: string
    ) {
        const tokens = (this.toshl as ToshlMode).tokens;
        const retryAfterSeconds = this.signInLimiter.retryAfterSeconds(ip);
        if (retryAfterSeconds > 0) {
            this.showSignIn(res, 429, client, request, { retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
            return;
        }

        const token = pasted.trim();
        let userId: string;
        try {
            if (!/^[\x21-\x7e]{6,512}$/.test(token)) {
                // Not counted as a failure: nothing was asked of Toshl, and counting junk
                // would let anyone run up lockouts for free.
                this.showSignIn(res, 400, client, request, {
                    error: 'That doesn\'t look like a Toshl token. Copy it again from developer.toshl.com/apps.',
                });
                return;
            }
            userId = await personalTokenUserId(token);
        } catch (error) {
            if (error instanceof InvalidPersonalTokenError) {
                this.signInLimiter.recordFailure(ip);
                logger.warn('Personal-token sign-in refused by Toshl', { clientId: client.clientId, ip });
                await sleep(FAILED_SIGN_IN_DELAY_MS);
                this.showSignIn(res, 401, client, request, {
                    error: 'Toshl did not accept that token. Copy it again from developer.toshl.com/apps.',
                    retryAfterSeconds: this.signInLimiter.retryAfterSeconds(ip),
                });
                return;
            }
            logger.error('Personal-token sign-in failed', { message: error instanceof Error ? error.message : String(error) });
            this.showSignIn(res, 502, client, request, { error: 'Toshl could not be reached. Try again in a minute.' });
            return;
        }

        this.signInLimiter.recordSuccess(ip);
        if (!this.userSignInLimiter.allow(`user:${userId}`)) {
            this.showSignIn(res, 429, client, request, { error: 'Too many connections for this account. Wait a minute and try again.' });
            return;
        }
        const isNew = !tokens.has(userId);
        await tokens.save(userId, personalTokenRecord(token));
        // The interest signal: one line per connection, with how many people are connected.
        logger.info('User connected with a personal token', { clientId: client.clientId, newUser: isNew, users: tokens.size });
        const code = this.createCode({ ...request, sub: userId });
        this.redirectWithParams(res, request.redirectUri, { code, state: request.state });
    }

    private showSignIn(
        res: ServerResponse,
        status: number,
        client: OAuthClient,
        request: AuthorizationRequest,
        extra: { error?: string; retryAfterSeconds?: number },
        headers: Record<string, string> = {}
    ) {
        const formToken = signPayload(this.formKeys[0], {
            typ: 'sign-in',
            client_id: request.clientId,
            redirect_uri: request.redirectUri,
            code_challenge: request.codeChallenge,
            scope: request.scope,
            state: request.state,
            exp: Date.now() + SIGN_IN_FORM_TTL_MS,
        });
        for (const [name, value] of Object.entries(headers)) {
            res.setHeader(name, value);
        }
        sendSignInPage(res, status, {
            clientName: client.clientName,
            redirectUri: request.redirectUri,
            loopback: client.loopback,
            formToken,
            operator: this.config.operator,
            ...(this.toshl?.client
                ? { toshlOrigin: new URL(this.toshl.client.authorizeRedirect(this.toshlRedirectUri(), 'x')).origin }
                : this.toshl
                  ? { personalToken: true }
                  : {}),
            ...extra,
        });
    }

    /**
     * Sends the browser back to the client with response parameters, including `iss`
     * (RFC 9207) so the client can tell which server answered
     */
    private redirectWithParams(res: ServerResponse, redirectUri: string, params: Record<string, string | undefined>) {
        const target = new URL(redirectUri);
        for (const [name, value] of Object.entries({ ...params, iss: this.issuer })) {
            if (value !== undefined) {
                target.searchParams.set(name, value);
            }
        }
        res.writeHead(303, { Location: target.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
        res.end();
    }

    private createCode(request: AuthorizationRequest): string {
        const now = Date.now();
        for (const [key, pending] of this.codes) {
            if (pending.expiresAt <= now) {
                this.codes.delete(key);
            }
        }
        if (this.codes.size >= MAX_PENDING_CODES) {
            // Bounded by the per-IP and per-user sign-in limits; drop the oldest rather than grow.
            const oldest = this.codes.keys().next().value;
            if (oldest !== undefined) {
                this.codes.delete(oldest);
            }
        }

        const code = randomToken(32);
        this.codes.set(sha256(code), { ...request, expiresAt: now + AUTHORIZATION_CODE_TTL_MS });
        return code;
    }

    private async token(req: IncomingMessage, res: ServerResponse, params: Map<string, string>) {
        const resource = params.get('resource');
        if (resource !== undefined && canonicalResource(resource) !== this.resource) {
            sendOAuthError(res, 400, 'invalid_target', `The resource must be ${this.resource}`);
            return;
        }

        const grantType = params.get('grant_type');
        if (grantType === 'authorization_code') {
            await this.exchangeCode(req, res, params);
        } else if (grantType === 'refresh_token') {
            await this.exchangeRefreshToken(req, res, params);
        } else {
            sendOAuthError(res, 400, 'unsupported_grant_type', 'Supported: authorization_code, refresh_token');
        }
    }

    private async exchangeCode(req: IncomingMessage, res: ServerResponse, params: Map<string, string>) {
        const code = params.get('code');
        const pending = code ? this.codes.get(sha256(code)) : undefined;
        const invalid = (description: string) => sendOAuthError(res, 400, 'invalid_grant', description);

        if (!code || !pending || pending.expiresAt <= Date.now()) {
            invalid('The authorization code is invalid or expired');
            return;
        }

        if (pending.consumed) {
            // RFC 6749 section 4.1.2: a replayed code revokes what it already issued. If the
            // first exchange is still running, it sees `replayed` and revokes on completion.
            pending.replayed = true;
            if (pending.usedFamilyId !== undefined) {
                await this.store.revokeFamily(pending.usedFamilyId);
            }
            logger.warn('Authorization code replayed; revoked the tokens it issued', {
                clientId: pending.clientId,
                ip: this.clientIp(req),
            });
            invalid('The authorization code was already used');
            return;
        }

        // Consumed by this attempt whatever its outcome: a failed redemption burns the code
        // too. Marked before the first await, so a concurrent exchange is seen as a replay.
        pending.consumed = true;

        const verifier = params.get('code_verifier');
        const mismatch =
            params.get('client_id') !== pending.clientId
                ? 'The code was issued to another client'
                : params.get('redirect_uri') !== pending.redirectUri
                  ? 'redirect_uri does not match the authorization request'
                  : !verifier || !CODE_VERIFIER.test(verifier) || sha256(verifier) !== pending.codeChallenge
                    ? 'PKCE verification failed'
                    : undefined;
        if (mismatch) {
            this.codes.delete(sha256(code));
            invalid(mismatch);
            return;
        }

        pending.usedFamilyId = randomToken(16);
        const sub = pending.sub ?? OWNER;
        if (sub !== OWNER) {
            await this.store.trimFamilies(sub, MAX_SIGN_INS_PER_USER);
        }
        const { token: refreshToken } = await this.store.issue(
            {
                clientId: pending.clientId,
                scope: pending.scope,
                resource: this.resource,
                ...(sub !== OWNER ? { sub } : {}),
            },
            pending.usedFamilyId
        );
        if (pending.replayed) {
            await this.store.revokeFamily(pending.usedFamilyId);
            invalid('The authorization code was already used');
            return;
        }

        logger.info('OAuth tokens issued', { clientId: pending.clientId });
        this.sendTokens(res, pending.clientId, pending.scope, refreshToken, sub);
    }

    private async exchangeRefreshToken(req: IncomingMessage, res: ServerResponse, params: Map<string, string>) {
        const refreshToken = params.get('refresh_token');
        if (!refreshToken) {
            sendOAuthError(res, 400, 'invalid_request', 'refresh_token is required');
            return;
        }
        if (params.has('scope') && parseScope(params.get('scope')) === undefined) {
            sendOAuthError(res, 400, 'invalid_scope', `The only scope is "${SCOPE}"`);
            return;
        }

        const result = await this.store.rotate(refreshToken, params.get('client_id'));
        if (!result.ok) {
            if (result.reason !== 'unknown') {
                logger.info('Refresh token refused', { reason: result.reason, ip: this.clientIp(req) });
            }
            sendOAuthError(res, 400, 'invalid_grant', 'The refresh token is invalid, expired or revoked');
            return;
        }

        if (result.grant.resource !== this.resource) {
            // Issued while MCP_PUBLIC_URL was something else; its tokens would name the wrong audience.
            await this.store.revokeFamily(result.grant.familyId);
            sendOAuthError(res, 400, 'invalid_grant', 'The refresh token was issued for another resource');
            return;
        }

        const sub = result.grant.sub ?? OWNER;
        if (this.toshl && (sub === OWNER || !this.toshl.tokens.has(sub))) {
            // Disconnected from Toshl (or issued before multi-user mode): sign in again.
            await this.store.revokeFamily(result.grant.familyId);
            sendOAuthError(res, 400, 'invalid_grant', 'Connect to Toshl again');
            return;
        }
        if (!this.toshl && sub !== OWNER) {
            await this.store.revokeFamily(result.grant.familyId);
            sendOAuthError(res, 400, 'invalid_grant', 'The refresh token was issued in another sign-in mode');
            return;
        }

        this.sendTokens(res, result.grant.clientId, result.grant.scope, result.token, sub);
    }

    private sendTokens(res: ServerResponse, clientId: string, scope: string, refreshToken: string, sub: string) {
        const now = Math.floor(Date.now() / 1000);
        const accessToken = signPayload(this.accessKeys[0], {
            typ: 'access',
            iss: this.issuer,
            aud: this.resource,
            sub,
            client_id: clientId,
            scope,
            iat: now,
            exp: now + ACCESS_TOKEN_TTL_SECONDS,
            jti: randomToken(16),
        });

        sendJson(res, 200, {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_TOKEN_TTL_SECONDS,
            refresh_token: refreshToken,
            scope,
        });
    }

    /** RFC 7009: always 200, whether or not the token was known. */
    private async revoke(res: ServerResponse, params: Map<string, string>) {
        const token = params.get('token');
        if (!token) {
            sendOAuthError(res, 400, 'invalid_request', 'token is required');
            return;
        }
        if (await this.store.revoke(token)) {
            logger.info('Refresh token family revoked');
        }
        res.writeHead(200, { 'Cache-Control': 'no-store' });
        res.end();
    }
}
