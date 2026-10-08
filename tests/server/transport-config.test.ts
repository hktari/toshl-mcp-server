import { loadTransportConfig } from '../../src/server/transport-config.js';

// Placeholder long enough to pass the length check.
const TOKEN = 'x'.repeat(32);

describe('loadTransportConfig', () => {
    test('defaults to stdio', () => {
        expect(loadTransportConfig({})).toEqual({ transport: 'stdio' });
    });

    test('http defaults to loopback port 3000', () => {
        expect(loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_AUTH_TOKEN: TOKEN })).toEqual({
            transport: 'http',
            http: {
                host: '127.0.0.1',
                port: 3000,
                authToken: TOKEN,
                allowNoAuth: false,
                trustProxy: false,
                allowedHosts: [],
                allowedOrigins: [],
            },
        });
    });

    test('http refuses to load without MCP_AUTH_TOKEN', () => {
        expect(() => loadTransportConfig({ MCP_TRANSPORT: 'http' })).toThrow(/MCP_AUTH_TOKEN.*MCP_ALLOW_NO_AUTH=true/);
    });

    test('MCP_ALLOW_NO_AUTH=true allows http without a token', () => {
        const config = loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_ALLOW_NO_AUTH: 'TRUE' });

        expect(config.transport === 'http' && config.http).toMatchObject({ authToken: undefined, allowNoAuth: true });
    });

    test.each(['1', 'yes', 'false', ''])('MCP_ALLOW_NO_AUTH=%p is not an opt-out', (value) => {
        expect(() => loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_ALLOW_NO_AUTH: value })).toThrow(
            'MCP_AUTH_TOKEN'
        );
    });

    test('reads host, port, token and allowed hosts', () => {
        const config = loadTransportConfig({
            MCP_TRANSPORT: 'HTTP',
            MCP_HTTP_HOST: '0.0.0.0',
            MCP_HTTP_PORT: '8080',
            MCP_AUTH_TOKEN: TOKEN,
            MCP_ALLOWED_HOSTS: ' Toshl-MCP.example.com , ,other.example.com',
            MCP_ALLOWED_ORIGINS: 'HTTPS://Example.com:443/, http://localhost:6274',
        });

        expect(config).toEqual({
            transport: 'http',
            http: {
                host: '0.0.0.0',
                port: 8080,
                authToken: TOKEN,
                allowNoAuth: false,
                trustProxy: false,
                allowedHosts: ['toshl-mcp.example.com', 'other.example.com'],
                allowedOrigins: ['https://example.com', 'http://localhost:6274'],
            },
        });
    });

    test('treats an empty MCP_AUTH_TOKEN as unset', () => {
        expect(() => loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_AUTH_TOKEN: '  ' })).toThrow('MCP_AUTH_TOKEN');
    });

    test.each(['example.com', 'https://example.com/mcp', 'https://example.com/?a=1', 'ftp://example.com', 'null'])(
        'rejects MCP_ALLOWED_ORIGINS entry %p',
        (origin) => {
            expect(() =>
                loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_AUTH_TOKEN: TOKEN, MCP_ALLOWED_ORIGINS: origin })
            ).toThrow('MCP_ALLOWED_ORIGINS');
        }
    );

    test('rejects an unknown transport', () => {
        expect(() => loadTransportConfig({ MCP_TRANSPORT: 'sse' })).toThrow('MCP_TRANSPORT');
    });

    test.each(['0', '65536', 'abc', '80.5', '-1'])('rejects port %s', (port) => {
        expect(() => loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_AUTH_TOKEN: TOKEN, MCP_HTTP_PORT: port })).toThrow(
            'MCP_HTTP_PORT'
        );
    });

    test('rejects a short MCP_AUTH_TOKEN without echoing it', () => {
        expect(() => loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_AUTH_TOKEN: 'hunter2' })).toThrow(
            /^MCP_AUTH_TOKEN must be at least 32 characters$/
        );
    });
});

describe('loadTransportConfig: OAuth', () => {
    const OAUTH_ENV = {
        MCP_TRANSPORT: 'http',
        MCP_PUBLIC_URL: 'https://Example.com/',
        MCP_OAUTH_PASSPHRASE: 'p'.repeat(20),
        MCP_OAUTH_SIGNING_KEY: 's'.repeat(32),
        MCP_OAUTH_STATE_DIR: '/app/state',
    };

    test('OAuth alone satisfies the auth requirement and adds the public host', () => {
        const config = loadTransportConfig({ ...OAUTH_ENV, MCP_TRUST_PROXY: 'true' });

        expect(config.transport === 'http' && config.http).toMatchObject({
            authToken: undefined,
            allowNoAuth: false,
            trustProxy: true,
            allowedHosts: ['example.com'],
            oauth: {
                publicUrl: 'https://example.com',
                passphrase: 'p'.repeat(20),
                signingKey: 's'.repeat(32),
                previousSigningKey: undefined,
                stateDir: '/app/state',
            },
        });
    });

    test('OAuth stays off without its secrets', () => {
        const config = loadTransportConfig({ MCP_TRANSPORT: 'http', MCP_AUTH_TOKEN: TOKEN });

        expect(config.transport === 'http' && config.http.oauth).toBeUndefined();
    });

    test.each([
        ['a short passphrase', { MCP_OAUTH_PASSPHRASE: 'p'.repeat(19) }, /^MCP_OAUTH_PASSPHRASE must be at least 20 characters$/],
        ['a missing passphrase', { MCP_OAUTH_PASSPHRASE: '' }, 'MCP_OAUTH_PASSPHRASE'],
        ['a missing signing key', { MCP_OAUTH_SIGNING_KEY: '' }, 'MCP_OAUTH_SIGNING_KEY must be'],
        ['a short signing key', { MCP_OAUTH_SIGNING_KEY: 's'.repeat(31) }, 'MCP_OAUTH_SIGNING_KEY must be'],
        ['a short previous key', { MCP_OAUTH_SIGNING_KEY_PREVIOUS: 'x' }, 'MCP_OAUTH_SIGNING_KEY_PREVIOUS'],
        ['the passphrase reused as key', { MCP_OAUTH_SIGNING_KEY: 'p'.repeat(32), MCP_OAUTH_PASSPHRASE: 'p'.repeat(32) }, 'must differ'],
        ['no state directory', { MCP_OAUTH_STATE_DIR: '' }, 'MCP_OAUTH_STATE_DIR'],
        ['no public URL', { MCP_PUBLIC_URL: '' }, 'MCP_PUBLIC_URL'],
        ['a public URL with a path', { MCP_PUBLIC_URL: 'https://example.com/mcp' }, 'MCP_PUBLIC_URL'],
        ['plain http off loopback', { MCP_PUBLIC_URL: 'http://example.com' }, 'MCP_PUBLIC_URL'],
    ])('rejects %s', (_name, override, message) => {
        expect(() => loadTransportConfig({ ...OAUTH_ENV, ...override })).toThrow(message);
    });

    test('allows plain http on loopback for local testing', () => {
        const config = loadTransportConfig({ ...OAUTH_ENV, MCP_PUBLIC_URL: 'http://localhost:3000' });

        expect(config.transport === 'http' && config.http.oauth?.publicUrl).toBe('http://localhost:3000');
    });

    test('never echoes a secret in an error', () => {
        const secret = 'never-echo-me-'.repeat(3);
        try {
            loadTransportConfig({ ...OAUTH_ENV, MCP_OAUTH_PASSPHRASE: secret, MCP_OAUTH_SIGNING_KEY: secret });
        } catch (error) {
            expect((error as Error).message).not.toContain(secret);
            return;
        }
        throw new Error('expected a throw');
    });
});
