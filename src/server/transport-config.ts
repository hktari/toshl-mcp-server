/**
 * Transport selection, loaded from the environment.
 *
 * stdio stays the default, so existing MCP client configs keep working unchanged.
 */

export interface HttpTransportConfig {
    /** Interface to bind. Loopback by default; put a TLS reverse proxy in front for remote use. */
    host: string;
    port: number;
    /** When set, `/mcp` requires `Authorization: Bearer <authToken>`. Never logged. */
    authToken?: string;
    /**
     * Explicit opt-out of `authToken`, for a proxy in front that enforces authentication.
     * Without either, HTTP mode refuses to start.
     */
    allowNoAuth: boolean;
    /** Host header names accepted besides loopback, e.g. the reverse proxy's public name. */
    allowedHosts: string[];
    /** Origins (`scheme://host[:port]`) accepted on `/mcp`. Requests without Origin are always accepted. */
    allowedOrigins: string[];
}

export type TransportConfig =
    | { transport: 'stdio' }
    | { transport: 'http'; http: HttpTransportConfig };

/** Shortest MCP_AUTH_TOKEN accepted. 32 hex characters is 128 bits. */
export const MIN_AUTH_TOKEN_LENGTH = 32;

/**
 * Reads the transport settings from the environment
 * @param env Environment to read, `process.env` by default
 * @returns Transport configuration
 * @throws Error naming the offending variable when a value is invalid
 */
export function loadTransportConfig(env: NodeJS.ProcessEnv = process.env): TransportConfig {
    const transport = (env.MCP_TRANSPORT || 'stdio').trim().toLowerCase();

    if (transport === 'stdio') {
        return { transport: 'stdio' };
    }

    if (transport !== 'http') {
        throw new Error(`MCP_TRANSPORT must be "stdio" or "http", got "${transport}"`);
    }

    const portText = (env.MCP_HTTP_PORT || '3000').trim();
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
        throw new Error(`MCP_HTTP_PORT must be a port number between 1 and 65535, got "${portText}"`);
    }

    const authToken = env.MCP_AUTH_TOKEN?.trim() || undefined;
    if (authToken !== undefined && authToken.length < MIN_AUTH_TOKEN_LENGTH) {
        // The value itself is deliberately left out of the message.
        throw new Error(`MCP_AUTH_TOKEN must be at least ${MIN_AUTH_TOKEN_LENGTH} characters`);
    }

    const allowNoAuth = (env.MCP_ALLOW_NO_AUTH || '').trim().toLowerCase() === 'true';
    if (authToken === undefined && !allowNoAuth) {
        throw new Error(
            'MCP_TRANSPORT=http requires MCP_AUTH_TOKEN. Set MCP_ALLOW_NO_AUTH=true only when a ' +
                'proxy in front of the server enforces authentication.'
        );
    }

    const allowedHosts = splitList(env.MCP_ALLOWED_HOSTS).map((host) => host.toLowerCase());
    const allowedOrigins = splitList(env.MCP_ALLOWED_ORIGINS).map(parseOrigin);

    return {
        transport: 'http',
        http: {
            host: (env.MCP_HTTP_HOST || '127.0.0.1').trim(),
            port,
            authToken,
            allowNoAuth,
            allowedHosts,
            allowedOrigins,
        },
    };
}

/**
 * Splits a comma-separated variable into its non-empty, trimmed items
 * @param value Variable value
 * @returns Items
 */
function splitList(value: string | undefined): string[] {
    return (value || '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

/**
 * Normalizes an MCP_ALLOWED_ORIGINS entry to the form browsers send in Origin
 * @param value Configured origin, e.g. `https://example.com`
 * @returns Serialized origin: lower-case scheme and host, default port dropped, no path
 * @throws Error when the entry is not a bare http(s) origin
 */
function parseOrigin(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`MCP_ALLOWED_ORIGINS entry is not a URL: "${value}"`);
    }

    const isBareOrigin = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash;
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !isBareOrigin || url.username) {
        throw new Error(`MCP_ALLOWED_ORIGINS entries must look like https://host[:port], got "${value}"`);
    }

    return url.origin;
}
