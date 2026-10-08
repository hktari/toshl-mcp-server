/**
 * The OAuth clients this server accepts. They are pinned here, not fetched: resolving a
 * Client ID Metadata Document would mean contacting a host other than the Toshl API, and
 * would let any caller make the server fetch a URL of its choosing.
 *
 * Values are taken from the clients' published metadata documents (the client_id URLs).
 * If Anthropic changes them, this list needs a release.
 */

export interface OAuthClient {
    clientId: string;
    clientName: string;
    redirectUris: string[];
    /**
     * Native app with RFC 8252 loopback redirects: the port is chosen per session, so it is
     * ignored when matching. Scheme, host and path must still match exactly.
     */
    loopback: boolean;
}

/** claude.ai on the web, Claude Desktop, the mobile apps and Cowork. */
export const CLAUDE_CLIENT: OAuthClient = {
    clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
    clientName: 'Claude',
    redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    loopback: false,
};

/** Claude Code, which completes OAuth on the user's own machine. */
export const CLAUDE_CODE_CLIENT: OAuthClient = {
    clientId: 'https://claude.ai/oauth/claude-code-client-metadata',
    clientName: 'Claude Code',
    redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    loopback: true,
};

const CLIENTS = new Map([CLAUDE_CLIENT, CLAUDE_CODE_CLIENT].map((client) => [client.clientId, client]));

/**
 * Looks up a pinned client
 * @param clientId client_id from the request
 * @returns The client, or undefined when it isn't one of the pinned ones
 */
export function findClient(clientId: string | undefined): OAuthClient | undefined {
    return clientId === undefined ? undefined : CLIENTS.get(clientId);
}

/**
 * Checks a redirect_uri against a client's registered ones: an exact string match, or for
 * loopback clients a match on scheme, host and path with any port (RFC 8252 section 7.3).
 * @param client Pinned client
 * @param redirectUri redirect_uri from the request
 * @returns Whether the URI is registered for the client
 */
export function isRegisteredRedirectUri(client: OAuthClient, redirectUri: string | undefined): boolean {
    if (redirectUri === undefined) {
        return false;
    }
    if (client.redirectUris.includes(redirectUri)) {
        return true;
    }
    if (!client.loopback) {
        return false;
    }

    let candidate: URL;
    try {
        candidate = new URL(redirectUri);
    } catch {
        return false;
    }
    if (candidate.username || candidate.password || candidate.search || candidate.hash) {
        return false;
    }

    return client.redirectUris.some((registered) => {
        const expected = new URL(registered);
        return (
            candidate.protocol === expected.protocol &&
            candidate.hostname === expected.hostname &&
            candidate.pathname === expected.pathname
        );
    });
}
