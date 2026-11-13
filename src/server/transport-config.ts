/**
 * Transport selection, loaded from the environment.
 *
 * stdio stays the default, so existing MCP client configs keep working unchanged.
 */

/** Built-in OAuth authorization server, for clients such as claude.ai connectors. */
export interface OAuthConfig {
    /** Public origin the server is reached at, e.g. `https://example.com`. Issuer and resource derive from it. */
    publicUrl: string;
    /** Entered on the sign-in page to approve a client. Never logged. Unused with `toshl`. */
    passphrase?: string;
    /**
     * Sign in with Toshl: set from TOSHL_OAUTH_CLIENT_ID / TOSHL_OAUTH_CLIENT_SECRET. Turns the
     * server multi-user: each person signs in to their own Toshl account, no passphrase.
     */
    toshl?: {
        clientId: string;
        clientSecret: string;
        /** Overrides for tests against a fake Toshl; production uses toshl.com. */
        tokenUrl?: string;
        authorizeUrl?: string;
    };
    /**
     * MCP_SIGN_IN=personal-token: multi-user like `toshl`, but each person pastes a Toshl
     * personal token on the consent page, for when no Toshl OAuth app is available.
     */
    personalTokens?: boolean;
    /**
     * Who runs a hosted instance, shown on the consent page with links to its terms and
     * privacy notice (MCP_OPERATOR_NAME, MCP_OPERATOR_URL, MCP_TERMS_URL, MCP_PRIVACY_URL).
     * Connecting then means agreeing to the terms.
     */
    operator?: { name: string; url?: string; termsUrl?: string; privacyUrl?: string };
    /** Signs access tokens and sign-in forms. Never logged. */
    signingKey: string;
    /** Still accepted for verification while rotating `signingKey`. */
    previousSigningKey?: string;
    /** Directory for the refresh-token store (hashes only). */
    stateDir: string;
}

export interface HttpTransportConfig {
    /** Interface to bind. Loopback by default; put a TLS reverse proxy in front for remote use. */
    host: string;
    port: number;
    /** When set, `/mcp` requires `Authorization: Bearer <authToken>`. Never logged. */
    authToken?: string;
    /** When set, `/mcp` also accepts access tokens issued by the built-in OAuth server. */
    oauth?: OAuthConfig;
    /**
     * Explicit opt-out of `authToken` and `oauth`, for a proxy in front that enforces
     * authentication. Without one of the three, HTTP mode refuses to start.
     */
    allowNoAuth: boolean;
    /** Take the client IP from the last X-Forwarded-For entry, for sign-in rate limiting. */
    trustProxy: boolean;
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

/** Shortest MCP_OAUTH_PASSPHRASE accepted. */
export const MIN_PASSPHRASE_LENGTH = 20;

/** Shortest MCP_OAUTH_SIGNING_KEY accepted. */
export const MIN_SIGNING_KEY_LENGTH = 32;

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
    if (authToken !== undefined && (env.TOSHL_OAUTH_CLIENT_ID?.trim() || env.TOSHL_OAUTH_CLIENT_SECRET?.trim() || env.MCP_SIGN_IN?.trim())) {
        // A static token has no user behind it, so it can't pick whose Toshl account to read.
        throw new Error('MCP_AUTH_TOKEN cannot be combined with Sign in with Toshl (TOSHL_OAUTH_CLIENT_ID)');
    }
    if (authToken !== undefined && authToken.length < MIN_AUTH_TOKEN_LENGTH) {
        // The value itself is deliberately left out of the message.
        throw new Error(`MCP_AUTH_TOKEN must be at least ${MIN_AUTH_TOKEN_LENGTH} characters`);
    }

    const oauth = loadOAuthConfig(env);

    const allowNoAuth = isTrue(env.MCP_ALLOW_NO_AUTH);
    if (authToken === undefined && oauth === undefined && !allowNoAuth) {
        throw new Error(
            'MCP_TRANSPORT=http requires MCP_AUTH_TOKEN or the MCP_OAUTH_* settings. Set ' +
                'MCP_ALLOW_NO_AUTH=true only when a proxy in front of the server enforces authentication.'
        );
    }

    const allowedHosts = splitList(env.MCP_ALLOWED_HOSTS).map((host) => host.toLowerCase());
    if (oauth) {
        // The public name is where every OAuth URL points, so it is always an accepted Host.
        allowedHosts.push(new URL(oauth.publicUrl).hostname);
    }
    const allowedOrigins = splitList(env.MCP_ALLOWED_ORIGINS).map(parseOrigin);

    return {
        transport: 'http',
        http: {
            host: (env.MCP_HTTP_HOST || '127.0.0.1').trim(),
            port,
            authToken,
            oauth,
            allowNoAuth,
            trustProxy: isTrue(env.MCP_TRUST_PROXY),
            allowedHosts,
            allowedOrigins,
        },
    };
}

/**
 * Reads the built-in OAuth server's settings. OAuth is on when any MCP_OAUTH_* secret is set,
 * and then every required setting must be present and valid.
 * @param env Environment to read
 * @returns OAuth configuration, or undefined when OAuth is off
 * @throws Error naming the offending variable; secret values are never echoed
 */
function loadOAuthConfig(env: NodeJS.ProcessEnv): OAuthConfig | undefined {
    const passphrase = env.MCP_OAUTH_PASSPHRASE?.trim() || undefined;
    const signingKey = env.MCP_OAUTH_SIGNING_KEY?.trim() || undefined;
    const previousSigningKey = env.MCP_OAUTH_SIGNING_KEY_PREVIOUS?.trim() || undefined;
    const toshl = loadToshlClient(env);
    const signIn = (env.MCP_SIGN_IN || '').trim().toLowerCase();
    if (signIn !== '' && signIn !== 'personal-token') {
        throw new Error(`MCP_SIGN_IN must be "personal-token" when set, got "${signIn}"`);
    }
    const personalTokens = signIn === 'personal-token';

    if (!passphrase && !signingKey && !toshl && !personalTokens) {
        return undefined;
    }

    if (toshl && personalTokens) {
        throw new Error('Choose one: MCP_SIGN_IN=personal-token or TOSHL_OAUTH_CLIENT_ID (Sign in with Toshl)');
    }
    if (toshl || personalTokens) {
        if (env.TOSHL_API_TOKEN?.trim()) {
            // Multi-user mode must never fall back to one shared account.
            throw new Error('Unset TOSHL_API_TOKEN: with Sign in with Toshl each user signs in with their own account');
        }
        if (passphrase) {
            throw new Error('MCP_OAUTH_PASSPHRASE is not used with Sign in with Toshl; unset it');
        }
    } else if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`MCP_OAUTH_PASSPHRASE must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
    }
    for (const [name, key] of [
        ['MCP_OAUTH_SIGNING_KEY', signingKey],
        ['MCP_OAUTH_SIGNING_KEY_PREVIOUS', previousSigningKey],
    ] as const) {
        if (name === 'MCP_OAUTH_SIGNING_KEY_PREVIOUS' && key === undefined) {
            continue;
        }
        if (!key || key.length < MIN_SIGNING_KEY_LENGTH) {
            throw new Error(`${name} must be at least ${MIN_SIGNING_KEY_LENGTH} characters`);
        }
    }
    if (passphrase === signingKey) {
        throw new Error('MCP_OAUTH_PASSPHRASE and MCP_OAUTH_SIGNING_KEY must differ');
    }

    const stateDir = env.MCP_OAUTH_STATE_DIR?.trim();
    if (!stateDir) {
        throw new Error('MCP_OAUTH_STATE_DIR is required when OAuth is enabled');
    }

    return {
        publicUrl: parsePublicUrl(env.MCP_PUBLIC_URL),
        passphrase,
        toshl,
        ...(personalTokens ? { personalTokens } : {}),
        ...loadOperator(env),
        signingKey: signingKey as string,
        previousSigningKey,
        stateDir,
    };
}

/**
 * Reads the operator shown on the consent page
 * @returns The operator, when MCP_OPERATOR_NAME is set
 */
function loadOperator(env: NodeJS.ProcessEnv): { operator?: NonNullable<OAuthConfig['operator']> } {
    const name = env.MCP_OPERATOR_NAME?.trim();
    if (!name) {
        return {};
    }
    const link = (key: string): string | undefined => {
        const value = env[key]?.trim();
        if (!value) {
            return undefined;
        }
        if (!/^https:\/\/\S+$/.test(value)) {
            throw new Error(`${key} must be an https URL`);
        }
        return value;
    };
    return {
        operator: {
            name,
            url: link('MCP_OPERATOR_URL'),
            termsUrl: link('MCP_TERMS_URL'),
            privacyUrl: link('MCP_PRIVACY_URL'),
        },
    };
}

/**
 * Reads the Toshl OAuth app credentials; both or neither
 * @returns The client credentials, or undefined when Sign in with Toshl is off
 */
function loadToshlClient(env: NodeJS.ProcessEnv): { clientId: string; clientSecret: string } | undefined {
    const clientId = env.TOSHL_OAUTH_CLIENT_ID?.trim() || undefined;
    const clientSecret = env.TOSHL_OAUTH_CLIENT_SECRET?.trim() || undefined;
    if (!clientId && !clientSecret) {
        return undefined;
    }
    if (!clientId || !clientSecret) {
        throw new Error('Set both TOSHL_OAUTH_CLIENT_ID and TOSHL_OAUTH_CLIENT_SECRET for Sign in with Toshl');
    }
    return { clientId, clientSecret };
}

/**
 * Validates MCP_PUBLIC_URL: a bare https origin, or http on a loopback host for local testing
 * @param value Configured value
 * @returns Serialized origin
 */
function parsePublicUrl(value: string | undefined): string {
    let url: URL;
    try {
        url = new URL((value || '').trim());
    } catch {
        throw new Error('MCP_PUBLIC_URL is required when OAuth is enabled, e.g. https://example.com');
    }

    const isBareOrigin = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash;
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const schemeOk = url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback);
    if (!isBareOrigin || !schemeOk || url.username || url.password) {
        throw new Error(
            `MCP_PUBLIC_URL must be an https origin without a path (http only on loopback), got "${value}"`
        );
    }

    return url.origin;
}

/**
 * Reads a boolean flag; only the exact word "true" (any case) turns it on
 * @param value Variable value
 * @returns Whether the flag is on
 */
function isTrue(value: string | undefined): boolean {
    return (value || '').trim().toLowerCase() === 'true';
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
