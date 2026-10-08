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
