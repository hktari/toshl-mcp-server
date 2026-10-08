import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunningHttpServer, startHttpServer } from '../../src/server/http.js';
import { CLAUDE_CLIENT, CLAUDE_CODE_CLIENT, isRegisteredRedirectUri } from '../../src/server/oauth/clients.js';
import { deriveKey, randomToken, sha256, signPayload } from '../../src/server/oauth/crypto.js';
import { RequestLimiter, rateLimitKey } from '../../src/server/oauth/rate-limit.js';
import { RefreshTokenStore } from '../../src/server/oauth/refresh-store.js';
import { OAuthConfig } from '../../src/server/transport-config.js';

// Credential-free: nothing here reaches the Toshl API.

const ISSUER = 'https://example.com';
const RESOURCE = `${ISSUER}/mcp`;
const PASSPHRASE = 'correct horse battery staple';
// Placeholders long enough to pass the length checks.
const SIGNING_KEY = 'k'.repeat(64);
const OTHER_SIGNING_KEY = 'q'.repeat(64);
const CLAUDE_CALLBACK = CLAUDE_CLIENT.redirectUris[0];

interface Response {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
}

/**
 * Sends a raw request; node:http lets a test set Origin and Host freely, and never follows redirects
 * @param port Server port
 * @param method HTTP method
 * @param path Path and query
 * @param options Headers and body
 * @returns Status, headers and body
 */
function send(
    port: number,
    method: string,
    path: string,
    options: { headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
    return new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, method, path, headers: options.headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
                resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') })
            );
        });
        req.on('error', reject);
        req.end(options.body);
    });
}

/**
 * POSTs a form
 * @returns The response
 */
function postForm(port: number, path: string, form: Record<string, string>, headers: Record<string, string> = {}) {
    return send(port, 'POST', path, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(form).toString(),
    });
}

/**
 * POSTs an MCP initialize request
 * @returns HTTP status
 */
async function initializeStatus(port: number, accessToken?: string): Promise<number> {
    const response = await send(port, 'POST', '/mcp', {
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
        }),
    });
    return response.status;
}

interface Pkce {
    verifier: string;
    challenge: string;
}

function newPkce(): Pkce {
    const verifier = randomToken(32);
    return { verifier, challenge: sha256(verifier) };
}

function authorizePath(params: Record<string, string>): string {
    return `/oauth/authorize?${new URLSearchParams(params).toString()}`;
}

function claudeAuthorizeParams(pkce: Pkce, overrides: Record<string, string> = {}): Record<string, string> {
    return {
        response_type: 'code',
        client_id: CLAUDE_CLIENT.clientId,
        redirect_uri: CLAUDE_CALLBACK,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state: 'state-123',
        scope: 'toshl',
        resource: RESOURCE,
        ...overrides,
    };
}

function formToken(html: string): string {
    const match = /name="request" value="([^"]+)"/.exec(html);
    if (!match) {
        throw new Error('sign-in page has no request field');
    }
    return match[1];
}

class TestServer {
    running!: RunningHttpServer;
    trustProxy = false;

    constructor(readonly stateDir: string, readonly oauth: OAuthConfig) {}

    get port() {
        return this.running.port;
    }

    get resource() {
        return `${this.oauth.publicUrl}/mcp`;
    }

    static async start(overrides: Partial<OAuthConfig> = {}, stateDir?: string): Promise<TestServer> {
        const dir = stateDir ?? (await mkdtemp(join(tmpdir(), 'toshl-oauth-')));
        const server = new TestServer(dir, {
            publicUrl: ISSUER,
            passphrase: PASSPHRASE,
            signingKey: SIGNING_KEY,
            stateDir: dir,
            ...overrides,
        });
        await server.restart();
        return server;
    }

    async restart() {
        this.running = await startHttpServer({
            host: '127.0.0.1',
            port: 0,
            oauth: this.oauth,
            allowNoAuth: false,
            trustProxy: this.trustProxy,
            allowedHosts: ['example.com'],
            allowedOrigins: [],
        });
    }

    async stop(removeState = true) {
        await this.running.close();
        if (removeState) {
            await rm(this.stateDir, { recursive: true, force: true });
        }
    }

    /** Runs the sign-in page with a passphrase and returns the redirect. */
    async signIn(params: Record<string, string>, passphrase = PASSPHRASE): Promise<Response> {
        const page = await send(this.port, 'GET', authorizePath(params));
        expect(page.status).toBe(200);
        return postForm(
            this.port,
            '/oauth/authorize',
            { request: formToken(page.body), passphrase, action: 'approve' },
            { Origin: this.oauth.publicUrl }
        );
    }

    /** Full Claude flow up to tokens. */
    async obtainTokens(): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
        const pkce = newPkce();
        const redirect = await this.signIn(claudeAuthorizeParams(pkce, { resource: this.resource }));
        const code = new URL(redirect.headers.location as string).searchParams.get('code') as string;
        const response = await postForm(this.port, '/oauth/token', {
            grant_type: 'authorization_code',
            code,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: pkce.verifier,
            resource: this.resource,
        });
        expect(response.status).toBe(200);
        return JSON.parse(response.body);
    }

    refresh(refreshToken: string) {
        return postForm(this.port, '/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: CLAUDE_CLIENT.clientId,
            resource: this.resource,
        });
    }
}

describe('OAuth discovery', () => {
    let server: TestServer;
    beforeAll(async () => (server = await TestServer.start()));
    afterAll(async () => server.stop());

    test('/mcp without a token answers 401 pointing at the resource metadata', async () => {
        const response = await send(server.port, 'POST', '/mcp', {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: '{}',
        });

        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe(
            `Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp", scope="toshl"`
        );
    });

    test.each(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])(
        'serves protected resource metadata at %s',
        async (path) => {
            const response = await send(server.port, 'GET', path);

            expect(response.status).toBe(200);
            expect(JSON.parse(response.body)).toMatchObject({
                resource: RESOURCE,
                authorization_servers: [ISSUER],
                scopes_supported: ['toshl'],
            });
        }
    );

    test('advertises what makes Claude use its published client identity, and nothing more', async () => {
        const response = await send(server.port, 'GET', '/.well-known/oauth-authorization-server');
        const metadata = JSON.parse(response.body);

        expect(metadata).toMatchObject({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/oauth/authorize`,
            token_endpoint: `${ISSUER}/oauth/token`,
            revocation_endpoint: `${ISSUER}/oauth/revoke`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['none'],
            client_id_metadata_document_supported: true,
            code_challenge_methods_supported: ['S256'],
            authorization_response_iss_parameter_supported: true,
        });
        expect(metadata.registration_endpoint).toBeUndefined();
    });

    test('accepts the public hostname as Host', async () => {
        const response = await send(server.port, 'GET', '/healthz', { headers: { Host: 'example.com' } });

        expect(response.status).toBe(200);
    });
});

describe('OAuth sign-in and tokens', () => {
    let server: TestServer;
    beforeEach(async () => (server = await TestServer.start()));
    afterEach(async () => server.stop());

    test('full flow: sign-in, code exchange, /mcp access', async () => {
        const pkce = newPkce();
        const redirect = await server.signIn(claudeAuthorizeParams(pkce));

        expect(redirect.status).toBe(303);
        const location = new URL(redirect.headers.location as string);
        expect(`${location.origin}${location.pathname}`).toBe(CLAUDE_CALLBACK);
        expect(location.searchParams.get('state')).toBe('state-123');
        expect(location.searchParams.get('iss')).toBe(ISSUER);

        const response = await postForm(server.port, '/oauth/token', {
            grant_type: 'authorization_code',
            code: location.searchParams.get('code') as string,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: pkce.verifier,
            resource: RESOURCE,
        });

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        const tokens = JSON.parse(response.body);
        expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'toshl' });
        expect(await initializeStatus(server.port, tokens.access_token)).toBe(200);
    });

    test('the sign-in page names the client and return host, and is locked down', async () => {
        const page = await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce())));

        expect(page.body).toContain('<strong>Claude</strong>');
        expect(page.body).toContain('<strong>claude.ai</strong>');
        expect(page.body).not.toContain('<script');
        const csp = page.headers['content-security-policy'] as string;
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("form-action 'self' https://claude.ai");
        expect(page.headers['cache-control']).toBe('no-store');
    });

    test('Claude Code signs in through a loopback callback on any port', async () => {
        const pkce = newPkce();
        const callback = 'http://127.0.0.1:53117/callback';
        const page = await send(
            server.port,
            'GET',
            authorizePath(
                claudeAuthorizeParams(pkce, { client_id: CLAUDE_CODE_CLIENT.clientId, redirect_uri: callback })
            )
        );
        expect(page.body).toContain('program running on the device');

        const redirect = await postForm(
            server.port,
            '/oauth/authorize',
            { request: formToken(page.body), passphrase: PASSPHRASE, action: 'approve' },
            { Origin: ISSUER }
        );
        const code = new URL(redirect.headers.location as string).searchParams.get('code') as string;
        expect(redirect.headers.location).toMatch(/^http:\/\/127\.0\.0\.1:53117\/callback\?code=/);

        const response = await postForm(server.port, '/oauth/token', {
            grant_type: 'authorization_code',
            code,
            redirect_uri: callback,
            client_id: CLAUDE_CODE_CLIENT.clientId,
            code_verifier: pkce.verifier,
        });
        expect(response.status).toBe(200);
    });

    test('Cancel returns access_denied to the client', async () => {
        const page = await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce())));
        const redirect = await postForm(
            server.port,
            '/oauth/authorize',
            { request: formToken(page.body), action: 'deny' },
            { Origin: ISSUER }
        );

        expect(redirect.status).toBe(303);
        expect(new URL(redirect.headers.location as string).searchParams.get('error')).toBe('access_denied');
    });

    test('refresh rotates the token; reuse after the grace window revokes the family', async () => {
        const tokens = await server.obtainTokens();
        const first = await server.refresh(tokens.refresh_token);
        expect(first.status).toBe(200);
        const rotated = JSON.parse(first.body);
        expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
        expect(await initializeStatus(server.port, rotated.access_token)).toBe(200);

        // A retry inside the grace window (two concurrent refreshes) still succeeds.
        expect((await server.refresh(tokens.refresh_token)).status).toBe(200);

        const realNow = Date.now;
        const later = realNow() + 31 * 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => later);
        try {
            const reused = await server.refresh(tokens.refresh_token);
            expect(reused.status).toBe(400);
            expect(JSON.parse(reused.body).error).toBe('invalid_grant');
            // The legitimate successor went down with the family.
            expect((await server.refresh(rotated.refresh_token)).status).toBe(400);
        } finally {
            jest.restoreAllMocks();
        }
    });

    test('tokens survive a restart with the same key and state directory', async () => {
        const tokens = await server.obtainTokens();
        await server.stop(false);
        await server.restart();

        expect(await initializeStatus(server.port, tokens.access_token)).toBe(200);
        expect((await server.refresh(tokens.refresh_token)).status).toBe(200);
    });

    test('the store holds only hashes, never a token', async () => {
        const tokens = await server.obtainTokens();
        const stored = await readFile(join(server.stateDir, 'refresh-tokens.json'), 'utf8');

        expect(stored).not.toContain(tokens.refresh_token);
        expect(stored).toContain(sha256(tokens.refresh_token));
    });

    test('revocation ends the refresh token family', async () => {
        const tokens = await server.obtainTokens();
        const revoked = await postForm(server.port, '/oauth/revoke', { token: tokens.refresh_token });

        expect(revoked.status).toBe(200);
        expect((await server.refresh(tokens.refresh_token)).status).toBe(400);
    });

    test('an expired access token is refused', async () => {
        const tokens = await server.obtainTokens();
        const later = Date.now() + 3601 * 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => later);
        try {
            expect(await initializeStatus(server.port, tokens.access_token)).toBe(401);
        } finally {
            jest.restoreAllMocks();
        }
    });

    test('a tampered access token is refused with invalid_token', async () => {
        const tokens = await server.obtainTokens();
        const [version, payload, mac] = tokens.access_token.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        claims.exp += 86400;
        const forged = `${version}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${mac}`;

        const response = await send(server.port, 'POST', '/mcp', {
            headers: { Authorization: `Bearer ${forged}`, 'Content-Type': 'application/json' },
            body: '{}',
        });
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });

    test.each([
        ['another audience', { aud: 'https://example.com/other' }],
        ['another issuer', { iss: 'https://www.example.com' }],
        ['no toshl scope', { scope: 'offline_access' }],
        ['another token type', { typ: 'sign-in' }],
    ])('refuses a correctly signed access token with %s', async (_name, override) => {
        const now = Math.floor(Date.now() / 1000);
        const claims = { typ: 'access', iss: ISSUER, aud: RESOURCE, scope: 'toshl', iat: now, exp: now + 600 };
        const key = deriveKey(SIGNING_KEY, 'access-token');

        // The unmodified claims pass, so each refusal below is down to the one changed claim.
        expect(await initializeStatus(server.port, signPayload(key, claims))).toBe(200);
        expect(await initializeStatus(server.port, signPayload(key, { ...claims, ...override }))).toBe(401);
    });

    test('two concurrent exchanges of one code never both succeed, and the replay revokes the winner', async () => {
        const pkce = newPkce();
        const redirect = await server.signIn(claudeAuthorizeParams(pkce));
        const exchange = {
            grant_type: 'authorization_code',
            code: new URL(redirect.headers.location as string).searchParams.get('code') as string,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: pkce.verifier,
        };

        const responses = await Promise.all([
            postForm(server.port, '/oauth/token', exchange),
            postForm(server.port, '/oauth/token', exchange),
        ]);

        const succeeded = responses.filter((response) => response.status === 200);
        expect(succeeded.length).toBeLessThanOrEqual(1);
        for (const response of succeeded) {
            expect((await server.refresh(JSON.parse(response.body).refresh_token)).status).toBe(400);
        }
    });

    test('a failed exchange burns the code', async () => {
        const pkce = newPkce();
        const redirect = await server.signIn(claudeAuthorizeParams(pkce));
        const exchange = {
            grant_type: 'authorization_code',
            code: new URL(redirect.headers.location as string).searchParams.get('code') as string,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: randomToken(32),
        };

        expect((await postForm(server.port, '/oauth/token', exchange)).status).toBe(400);
        const retry = await postForm(server.port, '/oauth/token', { ...exchange, code_verifier: pkce.verifier });
        expect(retry.status).toBe(400);
    });

    test('only one retry is allowed inside the grace window', async () => {
        const tokens = await server.obtainTokens();
        const successor = JSON.parse((await server.refresh(tokens.refresh_token)).body);

        expect((await server.refresh(tokens.refresh_token)).status).toBe(200);
        expect((await server.refresh(tokens.refresh_token)).status).toBe(400);
        // The second retry is treated as theft: the whole family is gone.
        expect((await server.refresh(successor.refresh_token)).status).toBe(400);
    });

    test('a replayed authorization code is refused and revokes what it issued', async () => {
        const pkce = newPkce();
        const redirect = await server.signIn(claudeAuthorizeParams(pkce));
        const exchange = {
            grant_type: 'authorization_code',
            code: new URL(redirect.headers.location as string).searchParams.get('code') as string,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: pkce.verifier,
        };

        const first = JSON.parse((await postForm(server.port, '/oauth/token', exchange)).body);
        const replay = await postForm(server.port, '/oauth/token', exchange);

        expect(replay.status).toBe(400);
        expect((await server.refresh(first.refresh_token)).status).toBe(400);
    });

    test.each([
        ['a wrong code_verifier', { code_verifier: randomToken(32) }],
        ['another client', { client_id: CLAUDE_CODE_CLIENT.clientId }],
        ['another redirect_uri', { redirect_uri: 'https://claude.ai/api/mcp/other' }],
    ])('the code exchange refuses %s', async (_name, override) => {
        const pkce = newPkce();
        const redirect = await server.signIn(claudeAuthorizeParams(pkce));
        const response = await postForm(server.port, '/oauth/token', {
            grant_type: 'authorization_code',
            code: new URL(redirect.headers.location as string).searchParams.get('code') as string,
            redirect_uri: CLAUDE_CALLBACK,
            client_id: CLAUDE_CLIENT.clientId,
            code_verifier: pkce.verifier,
            ...override,
        });

        expect(response.status).toBe(400);
        expect(JSON.parse(response.body).error).toBe('invalid_grant');
    });

    test('the token endpoint refuses a foreign resource and unknown grants', async () => {
        const wrongResource = await postForm(server.port, '/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: 'x',
            resource: 'https://www.example.com/mcp',
        });
        expect(JSON.parse(wrongResource.body).error).toBe('invalid_target');

        const jwtBearer = await postForm(server.port, '/oauth/token', {
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: 'x',
        });
        expect(JSON.parse(jwtBearer.body).error).toBe('unsupported_grant_type');

        const json = await send(server.port, 'POST', '/oauth/token', {
            headers: { 'Content-Type': 'application/json' },
            body: '{"grant_type":"refresh_token"}',
        });
        expect(json.status).toBe(400);
    });

    test.each([
        ['the same key but another issuer and audience', SIGNING_KEY],
        ['another key', OTHER_SIGNING_KEY],
    ])('refuses an access token from a server with %s', async (_name, signingKey) => {
        const other = await TestServer.start({ publicUrl: 'https://www.example.com', signingKey });
        try {
            const foreign = await other.obtainTokens();
            expect(await initializeStatus(other.port, foreign.access_token)).toBe(200);
            expect(await initializeStatus(server.port, foreign.access_token)).toBe(401);
        } finally {
            await other.stop();
        }
    });
});

describe('OAuth authorization request validation', () => {
    let server: TestServer;
    beforeAll(async () => (server = await TestServer.start()));
    afterAll(async () => server.stop());

    test.each([
        ['an unknown client', { client_id: 'https://www.example.com/client.json' }],
        ['an unregistered redirect_uri', { redirect_uri: 'https://www.example.com/callback' }],
        ['a Claude callback with a different path', { redirect_uri: 'https://claude.ai/api/mcp/other' }],
    ])('shows an error page, never a redirect, for %s', async (_name, override) => {
        const response = await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce(), override)));

        expect(response.status).toBe(400);
        expect(response.headers.location).toBeUndefined();
    });

    test.each([
        ['http://localhost:40000/callback', true],
        ['http://127.0.0.1/callback', true],
        ['http://127.0.0.1:40000/other', false],
        ['https://127.0.0.1:40000/callback', false],
        ['http://127.0.0.1:40000/callback?x=1', false],
        ['http://[::1]:40000/callback', false],
        ['http://www.example.com:40000/callback', false],
    ])('Claude Code loopback redirect %s accepted: %s', (uri, accepted) => {
        expect(isRegisteredRedirectUri(CLAUDE_CODE_CLIENT, uri)).toBe(accepted);
    });

    test('the Claude client accepts only its exact callback', () => {
        expect(isRegisteredRedirectUri(CLAUDE_CLIENT, CLAUDE_CALLBACK)).toBe(true);
        expect(isRegisteredRedirectUri(CLAUDE_CLIENT, `${CLAUDE_CALLBACK}/`)).toBe(false);
        expect(isRegisteredRedirectUri(CLAUDE_CLIENT, 'https://claude.ai:8443/api/mcp/auth_callback')).toBe(false);
    });

    test.each([
        ['no PKCE', { code_challenge: '', code_challenge_method: '' }, 'invalid_request'],
        ['PKCE plain', { code_challenge_method: 'plain' }, 'invalid_request'],
        ['a malformed challenge', { code_challenge: 'short' }, 'invalid_request'],
        ['response_type=token', { response_type: 'token' }, 'unsupported_response_type'],
        ['an unknown scope', { scope: 'toshl admin' }, 'invalid_scope'],
        ['a foreign resource', { resource: 'https://www.example.com/mcp' }, 'invalid_target'],
    ])('redirects with an error for %s', async (_name, override, error) => {
        const response = await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce(), override)));

        expect(response.status).toBe(303);
        const location = new URL(response.headers.location as string);
        expect(location.searchParams.get('error')).toBe(error);
        expect(location.searchParams.get('state')).toBe('state-123');
    });

    test('accepts offline_access alongside toshl, and a resource with a trailing slash', async () => {
        const params = claudeAuthorizeParams(newPkce(), { scope: 'toshl offline_access', resource: `${RESOURCE}/` });
        const response = await send(server.port, 'GET', authorizePath(params));

        expect(response.status).toBe(200);
    });

    test('refuses a repeated parameter', async () => {
        const path = `${authorizePath(claudeAuthorizeParams(newPkce()))}&client_id=${encodeURIComponent(CLAUDE_CLIENT.clientId)}`;
        const response = await send(server.port, 'GET', path);

        expect(response.status).toBe(400);
        expect(response.headers.location).toBeUndefined();
    });
});

describe('OAuth sign-in form protection', () => {
    let server: TestServer;
    beforeEach(async () => (server = await TestServer.start()));
    afterEach(async () => server.stop());

    const pageToken = async () =>
        formToken((await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce())))).body);

    test.each([
        ['no Origin', {}],
        ['a foreign Origin', { Origin: 'https://www.example.com' }],
    ])('refuses a form post with %s', async (_name, headers) => {
        const response = await postForm(
            server.port,
            '/oauth/authorize',
            { request: await pageToken(), passphrase: PASSPHRASE, action: 'approve' },
            headers
        );

        expect(response.status).toBe(403);
        expect(response.headers.location).toBeUndefined();
    });

    test('the page sends same-origin referrers, so browsers send a real Origin on the post', async () => {
        const page = await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce())));

        expect(page.headers['referrer-policy']).toBe('same-origin');
    });

    test('Enter submits Approve: it is the first submit button in the form', async () => {
        const page = await send(server.port, 'GET', authorizePath(claudeAuthorizeParams(newPkce())));

        expect(page.body.indexOf('value="approve"')).toBeGreaterThan(-1);
        expect(page.body.indexOf('value="approve"')).toBeLessThan(page.body.indexOf('value="deny"'));
    });

    test.each([
        ['Origin null with Sec-Fetch-Site same-origin', { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' }, 303],
        ['no Origin with Sec-Fetch-Site same-origin', { 'Sec-Fetch-Site': 'same-origin' }, 303],
        ['Origin null alone', { Origin: 'null' }, 403],
        ['Origin null with Sec-Fetch-Site cross-site', { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' }, 403],
        [
            'a foreign Origin even with Sec-Fetch-Site same-origin',
            { Origin: 'https://www.example.com', 'Sec-Fetch-Site': 'same-origin' },
            403,
        ],
    ])('form post with %s answers %s', async (_name, headers, status) => {
        const response = await postForm(
            server.port,
            '/oauth/authorize',
            { request: await pageToken(), passphrase: PASSPHRASE, action: 'approve' },
            headers as Record<string, string>
        );

        expect(response.status).toBe(status);
    });

    test('behind a trusted proxy, lockout follows the forwarded client address', async () => {
        await server.stop(false);
        server.trustProxy = true;
        await server.restart();

        const token = await pageToken();
        const attempt = (forwardedFor: string, passphrase: string) =>
            postForm(
                server.port,
                '/oauth/authorize',
                { request: token, passphrase, action: 'approve' },
                { Origin: ISSUER, 'X-Forwarded-For': forwardedFor }
            );

        for (let i = 0; i < 5; i++) {
            // The proxy appends the real client last; the first entry is client-supplied.
            await attempt('198.51.100.1, 203.0.113.5', 'a wrong passphrase for sure');
        }
        expect((await attempt('203.0.113.5', PASSPHRASE)).status).toBe(429);
        expect((await attempt('203.0.113.6', PASSPHRASE)).status).toBe(303);
    }, 20000);

    test('refuses a tampered or missing form token', async () => {
        const token = await pageToken();
        const tampered = `${token.slice(0, -2)}AA`;

        for (const request of [tampered, '']) {
            const response = await postForm(
                server.port,
                '/oauth/authorize',
                { request, passphrase: PASSPHRASE, action: 'approve' },
                { Origin: ISSUER }
            );
            expect(response.status).toBe(400);
        }
    });

    test('a wrong passphrase re-shows the page; five lock the IP out, even for the right one', async () => {
        const token = await pageToken();
        const attempt = (passphrase: string) =>
            postForm(server.port, '/oauth/authorize', { request: token, passphrase, action: 'approve' }, { Origin: ISSUER });

        const wrong = await attempt('wrong passphrase, quite long');
        expect(wrong.status).toBe(401);
        expect(wrong.body).toContain('Wrong passphrase');

        for (let i = 0; i < 4; i++) {
            await attempt('still the wrong passphrase');
        }

        const locked = await attempt(PASSPHRASE);
        expect(locked.status).toBe(429);
        expect(locked.headers['retry-after']).toBeDefined();
        expect(locked.headers.location).toBeUndefined();
    }, 20000);
});

describe('rate-limit keys', () => {
    test.each([
        ['203.0.113.5', '203.0.113.5'],
        [' 203.0.113.5 ', '203.0.113.5'],
        ['::ffff:203.0.113.5', '203.0.113.5'],
        ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
        ['2001:db8:1:2::9', '2001:db8:1:2::/64'],
        ['[2001:0db8:0001:0002::9]', '2001:db8:1:2::/64'],
        ['::1', '0:0:0:0::/64'],
        ['999.1.1.1', undefined],
        ['not-an-ip', undefined],
        ['1:2:3:4:5:6:7:8:9', undefined],
        ['1::2::3', undefined],
        ['x'.repeat(16000), undefined],
        [undefined, undefined],
    ])('%p keys as %p', (address, key) => {
        expect(rateLimitKey(address)).toBe(key);
    });

    test('a full request limiter evicts the oldest address instead of refusing new ones', () => {
        const limiter = new RequestLimiter(1);
        for (let i = 0; i < 10_000; i++) {
            limiter.allow('flood-' + i);
        }

        expect(limiter.allow('legitimate-client')).toBe(true);
    });
});

describe('refresh-token store file', () => {
    test.each([
        ['records is null', '{"version":1,"records":null}'],
        ['records is an array', '{"version":1,"records":[]}'],
        ['an unknown version', '{"version":2,"records":{}}'],
        ['not JSON', 'garbage'],
    ])('refuses to start when %s', async (_name, content) => {
        const dir = await mkdtemp(join(tmpdir(), 'toshl-oauth-'));
        try {
            await writeFile(join(dir, 'refresh-tokens.json'), content);
            await expect(RefreshTokenStore.open(dir)).rejects.toThrow('refresh-tokens.json');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
