import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger.js';
import { deriveKey } from './crypto.js';

/**
 * Sign in with Toshl: the OAuth client side towards toshl.com, and the store for each
 * user's Toshl tokens.
 *
 * Toshl's OAuth 2.0 (https://developer.toshl.com/docs/oauth/): authorization code grant,
 * client credentials in a Basic header at the token endpoint, access tokens that expire
 * (an hour in the docs), refresh tokens that renew them, codes valid for 30 seconds.
 */

export const TOSHL_AUTHORIZE_URL = 'https://toshl.com/oauth2/authorize';
export const TOSHL_TOKEN_URL = 'https://toshl.com/oauth2/token';

/** Refresh this long before the access token expires, so a request never carries a stale one. */
export const REFRESH_MARGIN_MS = 60 * 1000;

/** Used when Toshl leaves expires_in out. The documented value. */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

const STORE_FILE = 'toshl-tokens.json';

export interface ToshlOAuthClientConfig {
    clientId: string;
    clientSecret: string;
}

export interface ToshlTokens {
    accessToken: string;
    refreshToken: string;
    /** Epoch milliseconds. */
    expiresAt: number;
    /**
     * `pat`: a personal token the user pasted. It never expires, has no refresh token and goes
     * in a Basic header. `oauth` (the default, also for records without the field): Bearer.
     */
    kind?: 'oauth' | 'pat';
}

/** Personal tokens never expire; this keeps them clear of the refresh path. */
const NEVER = Number.MAX_SAFE_INTEGER;

/**
 * Builds the stored record for a personal token
 * @param token Personal token as pasted
 */
export function personalTokenRecord(token: string): ToshlTokens {
    return { accessToken: token, refreshToken: '', expiresAt: NEVER, kind: 'pat' };
}

/** The Authorization header Toshl expects for a personal token: the token as Basic username. */
export function basicAuthorization(token: string): string {
    return `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
}

/** Toshl refused the personal token. */
export class InvalidPersonalTokenError extends Error {}

/**
 * Reads whose a personal token is
 * @param token Personal token as pasted
 * @param apiBaseUrl Toshl API origin
 * @returns The Toshl user id
 * @throws InvalidPersonalTokenError when Toshl refuses it
 */
export async function personalTokenUserId(
    token: string,
    apiBaseUrl = process.env.TOSHL_API_BASE_URL || 'https://api.toshl.com'
): Promise<{ id: string; email?: string }> {
    try {
        const response = await axios.get<{ id?: unknown; email?: unknown }>(`${apiBaseUrl}/me`, {
            headers: { Authorization: basicAuthorization(token), Accept: 'application/json' },
            timeout: 10000,
        });
        const id = response.data?.id;
        if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
            throw new Error('Toshl /me returned no user id');
        }
        const email = typeof response.data?.email === 'string' && response.data.email ? response.data.email : undefined;
        return { id: String(id), email };
    } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            throw new InvalidPersonalTokenError('Toshl did not accept the token');
        }
        if (axios.isAxiosError(error)) {
            // Status only: the request carries the token.
            throw new Error(`Toshl /me failed (${error.response?.status ?? 'no response'})`);
        }
        throw error;
    }
}

/** Toshl revoked or rejected the refresh token: the user has to connect again. */
export class ToshlGrantRevokedError extends Error {}

interface StoreFile {
    version: 1;
    /** Keyed by Toshl user id; each value is `iv.tag.ciphertext`, base64url, AES-256-GCM. */
    records: Record<string, string>;
}

/**
 * Talks to Toshl's token endpoint and `/me`
 */
export class ToshlOAuthClient {
    private readonly http: AxiosInstance;

    constructor(
        private readonly config: ToshlOAuthClientConfig,
        apiBaseUrl = process.env.TOSHL_API_BASE_URL || 'https://api.toshl.com',
        private readonly tokenUrl = TOSHL_TOKEN_URL,
        private readonly authorizeUrl = TOSHL_AUTHORIZE_URL
    ) {
        this.http = axios.create({ baseURL: apiBaseUrl, timeout: 10000 });
    }

    /**
     * Where to send the browser to sign in. No scope is sent, so Toshl applies the scopes
     * the app was registered with (sending any must match them exactly anyway).
     * @param redirectUri Our callback
     * @param state Opaque value Toshl returns as-is (truncated at 255 characters)
     */
    authorizeRedirect(redirectUri: string, state: string): string {
        const url = new URL(this.authorizeUrl);
        url.searchParams.set('client_id', this.config.clientId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('state', state);
        return url.toString();
    }

    /** Exchanges an authorization code. Must happen within Toshl's 30-second code lifetime. */
    exchangeCode(code: string, redirectUri: string): Promise<ToshlTokens> {
        return this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    }

    /**
     * Renews an access token
     * @throws ToshlGrantRevokedError when Toshl answers invalid_grant
     */
    refresh(refreshToken: string): Promise<ToshlTokens> {
        return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, refreshToken);
    }

    /** @returns The Toshl user id the token belongs to */
    async userId(accessToken: string): Promise<string> {
        const response = await this.http.get<{ id?: unknown }>('/me', {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        const id = response.data?.id;
        if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
            throw new Error('Toshl /me returned no user id');
        }
        return String(id);
    }

    private async tokenRequest(form: Record<string, string>, previousRefresh?: string): Promise<ToshlTokens> {
        try {
            const response = await axios.post(this.tokenUrl, new URLSearchParams(form).toString(), {
                auth: { username: this.config.clientId, password: this.config.clientSecret },
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                timeout: 10000,
            });
            const body = response.data as Record<string, unknown>;
            if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
                throw new Error('Toshl token response had no access_token');
            }
            // Toshl may or may not rotate the refresh token; keep the old one when it doesn't send one.
            const refreshToken = typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : previousRefresh;
            if (!refreshToken) {
                throw new Error('Toshl token response had no refresh_token');
            }
            const expiresIn = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : DEFAULT_EXPIRES_IN_SECONDS;
            return { accessToken: body.access_token, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const code = (error.response?.data as { error?: unknown } | undefined)?.error;
                if (code === 'invalid_grant') {
                    throw new ToshlGrantRevokedError('Toshl rejected the grant');
                }
                // Never log the response body or the request: both can carry secrets.
                throw new Error(`Toshl token request failed (${error.response?.status ?? 'no response'}${typeof code === 'string' ? `, ${code}` : ''})`);
            }
            throw error;
        }
    }
}

/**
 * Each user's Toshl tokens, persisted to `<stateDir>/toshl-tokens.json`, encrypted.
 *
 * The key is derived from MCP_OAUTH_SIGNING_KEY; records written under the previous key
 * still decrypt during a rotation and are re-encrypted with the current one on next write.
 * Writes are atomic (temp file, fsync, rename), like the refresh-token store.
 */
export class ToshlTokenStore {
    private writeChain: Promise<void> = Promise.resolve();
    private readonly refreshing = new Map<string, Promise<string>>();

    /** Encrypted form of each record, so a write re-encrypts only the record that changed. */
    private readonly sealed = new Map<string, string>();

    private constructor(
        private readonly file: string,
        private readonly records: Map<string, ToshlTokens>,
        private readonly key: Buffer,
        private readonly client: ToshlOAuthClient | undefined
    ) {}

    /**
     * Opens the store
     * @param stateDir Directory holding the store
     * @param signingKey Current signing key
     * @param previousSigningKey Previous signing key, still accepted for decryption
     * @param client Toshl OAuth client, for refreshing; undefined when only personal tokens are stored
     * @throws Error when the file exists but can't be read or decrypted
     */
    static async open(
        stateDir: string,
        signingKey: string,
        previousSigningKey: string | undefined,
        client: ToshlOAuthClient | undefined
    ): Promise<ToshlTokenStore> {
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        try {
            await chmod(stateDir, 0o700);
        } catch {
            logger.warn('Could not restrict the OAuth state directory to its owner', { stateDir });
        }
        const file = join(stateDir, STORE_FILE);
        const keys = [signingKey, ...(previousSigningKey ? [previousSigningKey] : [])].map((secret) =>
            deriveKey(secret, 'toshl-token-store')
        );

        let parsed: StoreFile | undefined;
        try {
            parsed = JSON.parse(await readFile(file, 'utf8')) as StoreFile;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(`Toshl token store ${file} is unreadable. Delete it to disconnect every user.`);
            }
        }
        if (parsed !== undefined && (parsed.version !== 1 || typeof parsed.records !== 'object' || parsed.records === null)) {
            throw new Error(`Toshl token store ${file} has an unknown format`);
        }

        const store = new ToshlTokenStore(file, new Map(), keys[0], client);
        let changed = false;
        for (const [userId, sealed] of Object.entries(parsed?.records ?? {})) {
            const index = keys.findIndex((key) => unseal(key, userId, sealed) !== undefined);
            if (index < 0) {
                // A record no key opens (or one moved under another user id) is unusable; that user signs in again.
                logger.warn('Dropped a Toshl token record that no signing key decrypts');
                changed = true;
                continue;
            }
            store.records.set(userId, unseal(keys[index], userId, sealed) as ToshlTokens);
            if (index === 0) {
                store.sealed.set(userId, sealed);
            } else {
                // Written under the previous key: re-encrypt now, so finishing the rotation loses nothing.
                store.sealed.set(userId, seal(keys[0], userId, store.records.get(userId) as ToshlTokens));
                changed = true;
            }
        }
        if (changed) {
            await store.persist();
        }
        logger.info('Toshl token store opened', { users: store.records.size });
        return store;
    }

    get size(): number {
        return this.records.size;
    }

    has(userId: string): boolean {
        return this.records.has(userId);
    }

    async save(userId: string, tokens: ToshlTokens): Promise<void> {
        this.records.set(userId, tokens);
        this.sealed.set(userId, seal(this.key, userId, tokens));
        await this.persist();
    }

    async remove(userId: string): Promise<void> {
        this.sealed.delete(userId);
        if (this.records.delete(userId)) {
            await this.persist();
        }
    }

    /**
     * The Authorization header value for `userId`: Basic for a personal token, Bearer (refreshed
     * when needed) for an OAuth one
     * @throws ToshlGrantRevokedError when the user isn't connected
     */
    async authorization(userId: string): Promise<string> {
        const tokens = this.records.get(userId);
        if (tokens?.kind === 'pat') {
            return basicAuthorization(tokens.accessToken);
        }
        return `Bearer ${await this.accessToken(userId)}`;
    }

    /**
     * A valid access token for `userId`, refreshed when it is about to expire. Concurrent
     * callers for the same user share one refresh.
     * @throws ToshlGrantRevokedError when the user has no tokens or Toshl revoked them
     */
    accessToken(userId: string): Promise<string> {
        const tokens = this.records.get(userId);
        if (!tokens) {
            return Promise.reject(new ToshlGrantRevokedError('Not connected to Toshl'));
        }
        if (tokens.kind === 'pat' || tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
            return Promise.resolve(tokens.accessToken);
        }
        if (!this.client) {
            return Promise.reject(new ToshlGrantRevokedError('No OAuth client to refresh with'));
        }
        const client = this.client;
        const inFlight = this.refreshing.get(userId);
        if (inFlight) {
            return inFlight;
        }
        const run = (async () => {
            try {
                const renewed = await client.refresh(tokens.refreshToken);
                if (this.records.get(userId) !== tokens) {
                    // The user signed in again while this ran; their new tokens win.
                    return (this.records.get(userId) as ToshlTokens | undefined)?.accessToken ?? renewed.accessToken;
                }
                await this.save(userId, renewed);
                return renewed.accessToken;
            } catch (error) {
                if (error instanceof ToshlGrantRevokedError && this.records.get(userId) !== tokens) {
                    // A fresh sign-in replaced the revoked grant; keep it.
                    const current = this.records.get(userId);
                    if (current) {
                        return current.accessToken;
                    }
                }
                if (error instanceof ToshlGrantRevokedError) {
                    logger.info('Toshl grant revoked; user must connect again');
                    await this.remove(userId);
                }
                throw error;
            } finally {
                this.refreshing.delete(userId);
            }
        })();
        this.refreshing.set(userId, run);
        return run;
    }

    private persist(): Promise<void> {
        const snapshot: StoreFile = { version: 1, records: Object.fromEntries(this.sealed) };
        const write = async () => {
            const temp = `${this.file}.tmp`;
            const handle = await open(temp, 'w', 0o600);
            try {
                await handle.writeFile(JSON.stringify(snapshot));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temp, this.file);
        };
        this.writeChain = this.writeChain.then(write, write);
        return this.writeChain;
    }
}

/** The user id is authenticated data: a record copied under another user's id fails to decrypt. */
function seal(key: Buffer, userId: string, tokens: ToshlTokens): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(userId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function unseal(key: Buffer, userId: string, sealed: string): ToshlTokens | undefined {
    try {
        const [iv, tag, ciphertext] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAAD(Buffer.from(userId, 'utf8'));
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        const value = JSON.parse(plain) as ToshlTokens;
        return typeof value.accessToken === 'string' && typeof value.refreshToken === 'string' && typeof value.expiresAt === 'number' &&
            (value.kind === undefined || value.kind === 'oauth' || value.kind === 'pat')
            ? value
            : undefined;
    } catch {
        return undefined;
    }
}
