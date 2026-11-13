import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, IncomingMessage, request, Server as NodeServer, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_CLIENT } from '../../src/server/oauth/clients.js';
import { randomToken, sha256 } from '../../src/server/oauth/crypto.js';
import { loadTransportConfig, OAuthConfig } from '../../src/server/transport-config.js';
import type { RunningHttpServer } from '../../src/server/http.js';

/**
 * Sign in with Toshl, end to end against a fake Toshl: the OAuth hand-off, per-user tokens,
 * per-user cache, session ownership and a grant revoked at Toshl.
 */

const ISSUER = 'https://example.com';
const RESOURCE = `${ISSUER}/mcp`;
const SIGNING_KEY = 'k'.repeat(64);
const CLAUDE_CALLBACK = CLAUDE_CLIENT.redirectUris[0];
const CLIENT_ID = 'toshl-app-id';
const CLIENT_SECRET = 'toshl-app-secret';

interface Res {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
}

function send(port: number, method: string, path: string, options: { headers?: Record<string, string>; body?: string } = {}): Promise<Res> {
    return new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, method, path, headers: options.headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.end(options.body);
    });
}

/**
 * A fake Toshl: users "alice" and "bob". Codes are `code-<user>`; access tokens `at-<user>-<n>`.
 * Every API response carries the same ETag, so a cache shared across users would leak.
 */
class FakeToshl {
    server!: NodeServer;
    port = 0;
    tokenCalls: Array<Record<string, string>> = [];
    revoked = new Set<string>();
    expiresIn = 3600;
    private issued = 0;

    async start() {
        this.server = createServer((req, res) => void this.handle(req, res));
        await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
        this.port = (this.server.address() as AddressInfo).port;
    }

    stop() {
        return new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    get url() {
        return `http://127.0.0.1:${this.port}`;
    }

    private async handle(req: IncomingMessage, res: ServerResponse) {
        const url = new URL(req.url ?? '/', this.url);
        if (url.pathname === '/oauth2/token' && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c);
            const form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
            this.tokenCalls.push(form);
            const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
            if (req.headers.authorization !== `Basic ${basic}`) {
                return this.json(res, 401, { error: 'invalid_client' });
            }
            let user: string | undefined;
            if (form.grant_type === 'authorization_code') {
                user = /^code-(\w+)$/.exec(form.code ?? '')?.[1];
            } else if (form.grant_type === 'refresh_token') {
                user = /^rt-(\w+)$/.exec(form.refresh_token ?? '')?.[1];
                if (user && this.revoked.has(user)) user = undefined;
            }
            if (!user) {
                return this.json(res, 400, { error: 'invalid_grant' });
            }
            this.issued += 1;
            return this.json(res, 200, {
                access_token: `at-${user}-${this.issued}`,
                token_type: 'bearer',
                expires_in: this.expiresIn,
                refresh_token: `rt-${user}`,
            });
        }

        const user = /^Bearer at-(\w+)-\d+$/.exec(req.headers.authorization ?? '')?.[1];
        if (!user) {
            return this.json(res, 401, { error: 'unauthorized' });
        }
        if (url.pathname === '/me') {
            return this.json(res, 200, { id: `id-${user}`, email: `${user}@example.com` });
        }
        if (url.pathname === '/accounts') {
            if (req.headers['if-none-match'] === '"same"') {
                res.writeHead(304, { ETag: '"same"' });
                return res.end();
            }
            return this.json(res, 200, [{ id: `acc-${user}`, name: `${user}'s account`, currency: { code: 'EUR' }, balance: 1 }], { ETag: '"same"' });
        }
        return this.json(res, 404, { error: 'not found' });
    }

    private json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
    }
}

const toshl = new FakeToshl();
let startHttpServer: (typeof import('../../src/server/http.js'))['startHttpServer'];
let running: RunningHttpServer;
let stateDir: string;

function oauthConfig(): OAuthConfig {
    return {
        publicUrl: ISSUER,
        signingKey: SIGNING_KEY,
        stateDir,
        toshl: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            tokenUrl: `${toshl.url}/oauth2/token`,
            authorizeUrl: `${toshl.url}/oauth2/authorize`,
        },
    };
}

async function startServer() {
    running = await startHttpServer({
        host: '127.0.0.1',
        port: 0,
        oauth: oauthConfig(),
        allowNoAuth: false,
        trustProxy: false,
        allowedHosts: ['example.com'],
        allowedOrigins: [],
    });
}

beforeAll(async () => {
    await toshl.start();
    // The API client is created at import, so its base URL must be set before the import.
    process.env.TOSHL_API_BASE_URL = toshl.url;
    delete process.env.TOSHL_API_TOKEN;
    ({ startHttpServer } = await import('../../src/server/http.js'));
});

afterAll(async () => {
    await toshl.stop();
});

beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), 'toshl-sign-in-'));
    toshl.revoked.clear();
    toshl.tokenCalls = [];
    toshl.expiresIn = 3600;
    await startServer();
});

afterEach(async () => {
    await running.close();
    await rm(stateDir, { recursive: true, force: true });
});

function newPkce() {
    const verifier = randomToken(32);
    return { verifier, challenge: sha256(verifier) };
}

function authorizePath(challenge: string) {
    return `/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: CLAUDE_CLIENT.clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'claude-state',
        scope: 'toshl',
        resource: RESOURCE,
    })}`;
}

function cookieFrom(res: Res): string {
    const header = res.headers['set-cookie'];
    const line = (Array.isArray(header) ? header : [header ?? '']).find((c) => c.startsWith('__Host-toshl_sign_in=')) ?? '';
    return line.split(';')[0];
}

function formToken(html: string): string {
    const match = /name="request" value="([^"]+)"/.exec(html);
    if (!match) throw new Error('consent page has no request field');
    return match[1];
}

/** Opens the consent page and submits it. */
async function consent(challenge: string, action = 'approve', origin = ISSUER) {
    const page = await send(running.port, 'GET', authorizePath(challenge));
    expect(page.status).toBe(200);
    return send(running.port, 'POST', '/oauth/authorize', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
        body: new URLSearchParams({ request: formToken(page.body), action }).toString(),
    });
}

/** Starts sign-in and returns where Toshl is asked to send the browser, plus the browser cookie. */
async function startSignIn() {
    const pkce = newPkce();
    const res = await consent(pkce.challenge);
    expect(res.status).toBe(303);
    const toToshl = new URL(res.headers.location as string);
    return { pkce, toToshl, cookie: cookieFrom(res) };
}

/** The whole flow for one user, as Claude and the browser would run it. */
async function signInAs(user: string) {
    const { pkce, toToshl, cookie } = await startSignIn();
    const state = toToshl.searchParams.get('state') as string;
    const back = await send(running.port, 'GET', `/oauth/toshl/callback?code=code-${user}&state=${encodeURIComponent(state)}`, {
        headers: { Cookie: cookie },
    });
    expect(back.status).toBe(303);
    const toClaude = new URL(back.headers.location as string);
    expect(toClaude.origin + toClaude.pathname).toBe(CLAUDE_CALLBACK);
    expect(toClaude.searchParams.get('state')).toBe('claude-state');
    const tokenRes = await send(running.port, 'POST', '/oauth/token', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: toClaude.searchParams.get('code') as string,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: pkce.verifier,
            resource: RESOURCE,
        }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    return JSON.parse(tokenRes.body) as { access_token: string; refresh_token: string };
}

function rpcBody(res: Res): any {
    const data = res.body.split('\n').find((line) => line.startsWith('data: '));
    return JSON.parse(data ? data.slice(6) : res.body);
}

async function openSession(accessToken: string): Promise<string> {
    const res = await send(running.port, 'POST', '/mcp', {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
        }),
    });
    expect(res.status).toBe(200);
    return res.headers['mcp-session-id'] as string;
}

function callTool(accessToken: string, sessionId: string, name: string, args: object = {}) {
    return send(running.port, 'POST', '/mcp', {
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${accessToken}`,
            'Mcp-Session-Id': sessionId,
            'Mcp-Protocol-Version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }),
    });
}

describe('Sign in with Toshl', () => {
    test('sends the browser to Toshl with our callback, a state and a browser-binding cookie', async () => {
        const { toToshl, cookie } = await startSignIn();
        expect(toToshl.origin + toToshl.pathname).toBe(`${toshl.url}/oauth2/authorize`);
        expect(toToshl.searchParams.get('client_id')).toBe(CLIENT_ID);
        expect(toToshl.searchParams.get('response_type')).toBe('code');
        expect(toToshl.searchParams.get('redirect_uri')).toBe(`${ISSUER}/oauth/toshl/callback`);
        expect(toToshl.searchParams.has('scope')).toBe(false);
        expect((toToshl.searchParams.get('state') as string).length).toBeLessThanOrEqual(255);
        expect(cookie).toMatch(/^__Host-toshl_sign_in=.+/);
    });

    test('a signed-in user reads their own Toshl account through a tool', async () => {
        const tokens = await signInAs('alice');
        const session = await openSession(tokens.access_token);
        const res = await callTool(tokens.access_token, session, 'account_list');
        expect(res.status).toBe(200);
        expect(JSON.stringify(rpcBody(res))).toContain("alice's account");
        // The exchange used our callback as redirect_uri, as Toshl requires.
        expect(toshl.tokenCalls[0]).toMatchObject({ grant_type: 'authorization_code', code: 'code-alice', redirect_uri: `${ISSUER}/oauth/toshl/callback` });
    });

    test('two users never see each other’s data, even with an identical ETag', async () => {
        const alice = await signInAs('alice');
        const bob = await signInAs('bob');
        const aliceSession = await openSession(alice.access_token);
        const bobSession = await openSession(bob.access_token);

        const a1 = JSON.stringify(rpcBody(await callTool(alice.access_token, aliceSession, 'account_list')));
        const b1 = JSON.stringify(rpcBody(await callTool(bob.access_token, bobSession, 'account_list')));
        const a2 = JSON.stringify(rpcBody(await callTool(alice.access_token, aliceSession, 'account_list')));

        expect(a1).toContain("alice's account");
        expect(b1).toContain("bob's account");
        expect(b1).not.toContain('alice');
        expect(a2).toContain("alice's account");
        expect(a2).not.toContain('bob');
    });

    test("one user's token can't use another user's session", async () => {
        const alice = await signInAs('alice');
        const bob = await signInAs('bob');
        const aliceSession = await openSession(alice.access_token);
        const res = await callTool(bob.access_token, aliceSession, 'account_list');
        expect(res.status).toBe(404);
    });

    test('a callback from another browser is refused', async () => {
        const { toToshl } = await startSignIn();
        const state = toToshl.searchParams.get('state') as string;
        const res = await send(running.port, 'GET', `/oauth/toshl/callback?code=code-alice&state=${encodeURIComponent(state)}`, {
            headers: { Cookie: '__Host-toshl_sign_in=someone-else' },
        });
        expect(res.status).toBe(400);
        expect(toshl.tokenCalls).toHaveLength(0);
    });

    test('a state is single use', async () => {
        const { toToshl, cookie } = await startSignIn();
        const path = `/oauth/toshl/callback?code=code-alice&state=${encodeURIComponent(toToshl.searchParams.get('state') as string)}`;
        expect((await send(running.port, 'GET', path, { headers: { Cookie: cookie } })).status).toBe(303);
        expect((await send(running.port, 'GET', path, { headers: { Cookie: cookie } })).status).toBe(400);
    });

    test('declining at Toshl returns access_denied to Claude', async () => {
        const { toToshl, cookie } = await startSignIn();
        const res = await send(
            running.port,
            'GET',
            `/oauth/toshl/callback?error=access_denied&state=${encodeURIComponent(toToshl.searchParams.get('state') as string)}`,
            { headers: { Cookie: cookie } }
        );
        expect(res.status).toBe(303);
        const toClaude = new URL(res.headers.location as string);
        expect(toClaude.searchParams.get('error')).toBe('access_denied');
        expect(toClaude.searchParams.get('state')).toBe('claude-state');
    });

    test('shows our own consent page first, with no passphrase field and no redirect yet', async () => {
        const page = await send(running.port, 'GET', authorizePath(newPkce().challenge));
        expect(page.status).toBe(200);
        expect(page.body).toContain('Continue to Toshl');
        expect(page.body).not.toContain('passphrase');
        expect(page.headers['content-security-policy']).toContain(toshl.url);
    });

    test('cancelling on the consent page returns access_denied to Claude without visiting Toshl', async () => {
        const res = await consent(newPkce().challenge, 'deny');
        expect(res.status).toBe(303);
        expect(new URL(res.headers.location as string).searchParams.get('error')).toBe('access_denied');
    });

    test('a consent form posted from another site is refused', async () => {
        const res = await consent(newPkce().challenge, 'approve', 'https://evil.example');
        expect(res.status).toBe(403);
    });

    test('a token record moved under another user id is not accepted', async () => {
        await signInAs('alice');
        await signInAs('bob');
        const file = join(stateDir, 'toshl-tokens.json');
        const store = JSON.parse(await readFile(file, 'utf8'));
        store.records['id-bob'] = store.records['id-alice'];
        await running.close();
        await writeFile(file, JSON.stringify(store));
        await startServer();
        expect(JSON.parse(await readFile(file, 'utf8')).records['id-bob']).toBeUndefined();
    });

    test('Toshl tokens are stored encrypted', async () => {
        await signInAs('alice');
        const file = await readFile(join(stateDir, 'toshl-tokens.json'), 'utf8');
        expect(file).toContain('id-alice');
        expect(file).not.toContain('at-alice');
        expect(file).not.toContain('rt-alice');
    });

    test('users stay connected across a restart', async () => {
        const alice = await signInAs('alice');
        await running.close();
        await startServer();
        const session = await openSession(alice.access_token);
        const res = await callTool(alice.access_token, session, 'account_list');
        expect(JSON.stringify(rpcBody(res))).toContain("alice's account");
    });

    test('an expiring Toshl token is refreshed before use', async () => {
        toshl.expiresIn = 30; // inside the refresh margin, so the next use refreshes
        const alice = await signInAs('alice');
        const session = await openSession(alice.access_token);
        await callTool(alice.access_token, session, 'account_list');
        expect(toshl.tokenCalls.some((call) => call.grant_type === 'refresh_token' && call.refresh_token === 'rt-alice')).toBe(true);
    });

    test('a grant revoked at Toshl disconnects the user and Claude is asked to sign in again', async () => {
        toshl.expiresIn = 30;
        const alice = await signInAs('alice');
        const session = await openSession(alice.access_token);
        toshl.revoked.add('alice');

        const failed = await callTool(alice.access_token, session, 'account_list');
        expect(JSON.stringify(rpcBody(failed))).not.toContain("alice's account");

        const next = await send(running.port, 'POST', '/mcp', {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alice.access_token}` },
            body: '{}',
        });
        expect(next.status).toBe(401);
        expect(next.headers['www-authenticate']).toContain('resource_metadata=');

        const refresh = await send(running.port, 'POST', '/oauth/token', {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: alice.refresh_token, client_id: CLAUDE_CLIENT.clientId }).toString(),
        });
        expect(refresh.status).toBe(400);
    });
});

describe('Sign in with Toshl configuration', () => {
    const base = {
        MCP_TRANSPORT: 'http',
        MCP_PUBLIC_URL: ISSUER,
        MCP_OAUTH_SIGNING_KEY: SIGNING_KEY,
        MCP_OAUTH_STATE_DIR: '/tmp/x',
        TOSHL_OAUTH_CLIENT_ID: CLIENT_ID,
        TOSHL_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    };

    test('turns on with the client id and secret, without a passphrase', () => {
        const config = loadTransportConfig(base);
        expect(config.transport === 'http' && config.http.oauth?.toshl?.clientId).toBe(CLIENT_ID);
    });

    test('refuses a shared TOSHL_API_TOKEN alongside it', () => {
        expect(() => loadTransportConfig({ ...base, TOSHL_API_TOKEN: 'personal' })).toThrow(/TOSHL_API_TOKEN/);
    });

    test('refuses a passphrase alongside it', () => {
        expect(() => loadTransportConfig({ ...base, MCP_OAUTH_PASSPHRASE: 'p'.repeat(30) })).toThrow(/PASSPHRASE/);
    });

    test('refuses a static MCP_AUTH_TOKEN alongside it', () => {
        expect(() => loadTransportConfig({ ...base, MCP_AUTH_TOKEN: 'a'.repeat(40) })).toThrow(/MCP_AUTH_TOKEN/);
    });

    test('needs both the id and the secret', () => {
        expect(() => loadTransportConfig({ ...base, TOSHL_OAUTH_CLIENT_SECRET: '' })).toThrow(/TOSHL_OAUTH_CLIENT_SECRET/);
    });
});
