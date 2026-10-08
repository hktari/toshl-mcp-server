import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/server/server.js';
import { RunningHttpServer, startHttpServer } from '../../src/server/http.js';
import logger from '../../src/utils/logger.js';

// Credential-free: initialize and tools/list never reach the Toshl API.

const AUTH_TOKEN = 'test-token-0123456789abcdef0123456789';

const INITIALIZE = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0.0.0' } },
});

/**
 * Sends a raw request; unlike fetch(), node:http lets a test set Host and Origin freely
 * @param port Server port
 * @param options Method, path, headers and body
 * @returns HTTP status code
 */
function rawRequest(
    port: number,
    options: { method?: string; path?: string; headers?: Record<string, string>; body?: string }
): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                host: '127.0.0.1',
                port,
                method: options.method ?? 'GET',
                path: options.path ?? '/',
                headers: options.headers,
            },
            (res) => {
                res.resume();
                resolve(res.statusCode ?? 0);
            }
        );
        req.on('error', reject);
        req.end(options.body);
    });
}

/**
 * POSTs an initialize request to /mcp
 * @param port Server port
 * @param headers Extra headers
 * @returns HTTP status code
 */
function postInitialize(port: number, headers: Record<string, string>): Promise<number> {
    return rawRequest(port, {
        method: 'POST',
        path: '/mcp',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...headers,
        },
        body: INITIALIZE,
    });
}

/**
 * Lists tools over an in-memory transport, the same unconnected server stdio uses
 * @returns Tool names
 */
async function listToolsInProcess(): Promise<string[]> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    const client = new Client({ name: 'test', version: '0.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    await client.close();
    await server.close();

    return tools.map((tool) => tool.name);
}

describe('Streamable HTTP transport', () => {
    let running: RunningHttpServer;
    let baseUrl: string;

    beforeAll(async () => {
        running = await startHttpServer({
            host: '127.0.0.1',
            port: 0,
            authToken: AUTH_TOKEN,
            allowNoAuth: false,
            trustProxy: false,
            allowedHosts: [],
            allowedOrigins: ['https://example.com'],
        });
        baseUrl = `http://127.0.0.1:${running.port}`;
    });

    afterAll(async () => {
        await running.close();
    });

    const connectClient = async (token = AUTH_TOKEN) => {
        const client = new Client({ name: 'test', version: '0.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        });
        await client.connect(transport);
        return { client, transport };
    };

    test('initialize and tools/list return the same tools as stdio', async () => {
        const { client, transport } = await connectClient();

        expect(transport.sessionId).toBeDefined();
        const { tools } = await client.listTools();
        const expected = await listToolsInProcess();

        expect(expected.length).toBeGreaterThan(0);
        expect(tools.map((tool) => tool.name)).toEqual(expected);

        await transport.terminateSession();
        await client.close();
    });

    test('rejects /mcp without the bearer token', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: '{}',
        });

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
    });

    test('rejects /mcp with a wrong bearer token', async () => {
        await expect(connectClient('wrong-token-0123456789abcdef0123456789')).rejects.toThrow();
    });

    test('serves /healthz without auth and without data', async () => {
        const response = await fetch(`${baseUrl}/healthz`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    test('answers an unknown session with 404 so the client re-initializes', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'Mcp-Session-Id': 'no-such-session',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });

        expect(response.status).toBe(404);
    });

    test('requires initialize before any other request', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });

        expect(response.status).toBe(400);
    });

    test('answers malformed JSON with a parse error', async () => {
        const response = await fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: '{not json',
        });

        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe(-32700);
    });

    test('404s unknown paths', async () => {
        const response = await fetch(`${baseUrl}/elsewhere`);

        expect(response.status).toBe(404);
    });

    test.each(['http://x:99999/mcp', 'http://[::1/mcp'])(
        'answers the malformed request target %s with a quiet 400',
        async (target) => {
            const errorSpy = jest.spyOn(logger, 'error');
            try {
                expect(await rawRequest(running.port, { method: 'GET', path: target })).toBe(400);
                expect(errorSpy).not.toHaveBeenCalled();
            } finally {
                errorSpy.mockRestore();
            }
        }
    );

    test('accepts a listed Origin', async () => {
        const status = await postInitialize(running.port, {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            Origin: 'https://example.com',
        });

        expect(status).toBe(200);
    });

    test('refuses an unlisted Origin even with a valid token', async () => {
        const status = await postInitialize(running.port, {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            Origin: 'https://www.example.com',
        });

        expect(status).toBe(403);
    });

    test('refuses the opaque null Origin', async () => {
        const status = await postInitialize(running.port, {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            Origin: 'null',
        });

        expect(status).toBe(403);
    });

    test('checks Origin before auth, so a browser learns nothing about the token', async () => {
        const status = await postInitialize(running.port, { Origin: 'https://www.example.com' });

        expect(status).toBe(403);
    });
});

describe('Streamable HTTP without MCP_AUTH_TOKEN', () => {
    test('refuses to start unless explicitly allowed', async () => {
        await expect(
            startHttpServer({
                host: '127.0.0.1',
                port: 0,
                allowNoAuth: false,
                trustProxy: false,
                allowedHosts: [],
                allowedOrigins: [],
            })
        ).rejects.toThrow('MCP_ALLOW_NO_AUTH');
    });

    test('starts with MCP_ALLOW_NO_AUTH and logs a security warning', async () => {
        const errorSpy = jest.spyOn(logger, 'error');
        const running = await startHttpServer({
            host: '127.0.0.1',
            port: 0,
            allowNoAuth: true,
            trustProxy: false,
            allowedHosts: [],
            allowedOrigins: [],
        });

        try {
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY WARNING'), expect.anything());
            expect(await postInitialize(running.port, {})).toBe(200);
        } finally {
            errorSpy.mockRestore();
            await running.close();
        }
    });
});

describe('Streamable HTTP host validation', () => {
    let running: RunningHttpServer;

    beforeAll(async () => {
        running = await startHttpServer({
            host: '127.0.0.1',
            port: 0,
            authToken: AUTH_TOKEN,
            allowNoAuth: false,
            trustProxy: false,
            allowedHosts: ['toshl-mcp.example.com'],
            allowedOrigins: [],
        });
    });

    afterAll(async () => {
        await running.close();
    });

    const statusForHost = (host: string) => rawRequest(running.port, { path: '/healthz', headers: { Host: host } });

    test('accepts loopback names and the configured public name', async () => {
        expect(await statusForHost(`localhost:${running.port}`)).toBe(200);
        expect(await statusForHost(`127.0.0.1:${running.port}`)).toBe(200);
        expect(await statusForHost('toshl-mcp.example.com')).toBe(200);
    });

    test('refuses any other Host, the DNS rebinding case', async () => {
        expect(await statusForHost('attacker.example.com')).toBe(403);
        expect(await statusForHost(`attacker.example.com:${running.port}`)).toBe(403);
    });
});
