import { chmod, mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import logger from '../../utils/logger.js';
import { randomToken, sha256 } from './crypto.js';

/** A refresh token unused for this long expires. Each rotation starts the clock again. */
export const REFRESH_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** No refresh token outlives its family's first sign-in by more than this. */
export const REFRESH_MAX_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * A rotated token presented again once, within this window, is treated as a client retry
 * (two concurrent refreshes), not theft, and gets a fresh token instead of revoking the
 * family. A second retry, or one after the window, revokes it.
 */
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;

const STORE_FILE = 'refresh-tokens.json';

export interface RefreshGrant {
    /** All tokens descended from one sign-in share a family; reuse revokes the whole family. */
    familyId: string;
    clientId: string;
    scope: string;
    resource: string;
    familyCreatedAt: number;
}

interface RefreshRecord extends RefreshGrant {
    expiresAt: number;
    /** Set once this token has been exchanged for its successor. */
    rotatedAt?: number;
    /** Set once the single retry inside the grace window has been spent. */
    graceUsed?: boolean;
}

interface StoreFile {
    version: 1;
    /** Keyed by SHA-256 of the token. The tokens themselves are never stored. */
    records: Record<string, RefreshRecord>;
}

export type RotateResult =
    | { ok: true; token: string; grant: RefreshGrant }
    | { ok: false; reason: 'unknown' | 'expired' | 'client_mismatch' | 'reused' };

/**
 * Refresh-token store, persisted to `<stateDir>/refresh-tokens.json`.
 *
 * Only hashes are written, so the file can't be used to mint or replay a token. Writes go
 * to a temporary file that is renamed over the old one, so a crash never leaves a half
 * written store.
 */
export class RefreshTokenStore {
    private writeChain: Promise<void> = Promise.resolve();

    private constructor(
        private readonly file: string,
        private readonly records: Map<string, RefreshRecord>
    ) {}

    /**
     * Opens the store, creating the directory if needed
     * @param stateDir Directory holding the store file
     * @returns The store
     * @throws Error when an existing store file is unreadable, rather than silently starting empty
     */
    static async open(stateDir: string): Promise<RefreshTokenStore> {
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        try {
            // mkdir's mode only applies to a directory it creates; tighten an existing one too.
            await chmod(stateDir, 0o700);
        } catch {
            logger.warn('Could not restrict the OAuth state directory to its owner', { stateDir });
        }
        const file = join(stateDir, STORE_FILE);

        let parsed: StoreFile | undefined;
        try {
            parsed = JSON.parse(await readFile(file, 'utf8')) as StoreFile;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(
                    `Refresh-token store ${file} is unreadable. Delete it to sign every client out and start empty.`
                );
            }
        }

        const records = parsed?.records;
        if (
            parsed !== undefined &&
            (parsed.version !== 1 || typeof records !== 'object' || records === null || Array.isArray(records))
        ) {
            throw new Error(`Refresh-token store ${file} has an unknown format`);
        }

        const store = new RefreshTokenStore(file, new Map(Object.entries(parsed?.records ?? {})));
        if (store.prune(Date.now())) {
            await store.persist();
        }
        return store;
    }

    /**
     * Issues a refresh token for a new sign-in
     * @param grant What the token grants, minus the family, which is new
     * @param familyId Id for the new family, when the caller needs it before this resolves
     * @returns The token, to hand to the client once
     */
    async issue(
        grant: Omit<RefreshGrant, 'familyId' | 'familyCreatedAt'>,
        familyId: string = randomToken(16)
    ): Promise<{ token: string; grant: RefreshGrant }> {
        const now = Date.now();
        const familyGrant: RefreshGrant = { ...grant, familyId, familyCreatedAt: now };
        const token = this.add(familyGrant, now);
        await this.persist();
        return { token, grant: familyGrant };
    }

    /**
     * Exchanges a refresh token for its successor. The old token stops working; presenting it
     * again after the grace window revokes every token in its family.
     * @param token Presented refresh token
     * @param clientId client_id from the request, when the client sent one
     * @returns The new token, or why the exchange was refused
     */
    async rotate(token: string, clientId: string | undefined): Promise<RotateResult> {
        const now = Date.now();
        const hash = sha256(token);
        const record = this.records.get(hash);

        if (!record) {
            return { ok: false, reason: 'unknown' };
        }
        if (record.expiresAt <= now || record.familyCreatedAt + REFRESH_MAX_TTL_MS <= now) {
            this.records.delete(hash);
            await this.persist();
            return { ok: false, reason: 'expired' };
        }
        if (clientId !== undefined && clientId !== record.clientId) {
            return { ok: false, reason: 'client_mismatch' };
        }
        const isReuse =
            record.rotatedAt !== undefined &&
            (record.graceUsed === true || now - record.rotatedAt > REFRESH_REUSE_GRACE_MS);
        if (isReuse) {
            const revoked = this.deleteFamily(record.familyId);
            await this.persist();
            logger.warn('Refresh token reused after rotation; revoked its family', {
                clientId: record.clientId,
                revoked,
            });
            return { ok: false, reason: 'reused' };
        }

        const previous = { rotatedAt: record.rotatedAt, graceUsed: record.graceUsed };
        if (record.rotatedAt === undefined) {
            record.rotatedAt = now;
        } else {
            record.graceUsed = true;
        }
        const grant: RefreshGrant = {
            familyId: record.familyId,
            clientId: record.clientId,
            scope: record.scope,
            resource: record.resource,
            familyCreatedAt: record.familyCreatedAt,
        };
        const next = this.add(grant, now);

        try {
            await this.persist();
        } catch (error) {
            // The client never receives the successor, so put things back as they were:
            // otherwise its retry would look like reuse and revoke the family.
            this.records.delete(sha256(next));
            record.rotatedAt = previous.rotatedAt;
            record.graceUsed = previous.graceUsed;
            throw error;
        }
        return { ok: true, token: next, grant };
    }

    /**
     * Revokes the family a refresh token belongs to (RFC 7009)
     * @param token Presented token
     * @returns Whether the token was known
     */
    async revoke(token: string): Promise<boolean> {
        const record = this.records.get(sha256(token));
        if (!record) {
            return false;
        }
        this.deleteFamily(record.familyId);
        await this.persist();
        return true;
    }

    /**
     * Revokes every token in a family, e.g. after an authorization code is replayed
     * @param familyId Family to revoke
     */
    async revokeFamily(familyId: string): Promise<void> {
        if (this.deleteFamily(familyId) > 0) {
            await this.persist();
        }
    }

    /** Number of stored records, rotated ones included. */
    get size(): number {
        return this.records.size;
    }

    private add(grant: RefreshGrant, now: number): string {
        const token = randomToken(32);
        this.records.set(sha256(token), {
            ...grant,
            expiresAt: Math.min(now + REFRESH_IDLE_TTL_MS, grant.familyCreatedAt + REFRESH_MAX_TTL_MS),
        });
        this.prune(now);
        return token;
    }

    private deleteFamily(familyId: string): number {
        let count = 0;
        for (const [hash, record] of this.records) {
            if (record.familyId === familyId) {
                this.records.delete(hash);
                count++;
            }
        }
        return count;
    }

    /** Drops expired records, rotated ones included once their own expiry passes. */
    private prune(now: number): boolean {
        let pruned = false;
        for (const [hash, record] of this.records) {
            if (record.expiresAt <= now) {
                this.records.delete(hash);
                pruned = true;
            }
        }
        return pruned;
    }

    /** Serializes writes, so concurrent rotations can't interleave on disk. */
    private persist(): Promise<void> {
        const snapshot: StoreFile = { version: 1, records: Object.fromEntries(this.records) };
        const write = async () => {
            const temp = `${this.file}.tmp`;
            const handle = await open(temp, 'w', 0o600);
            try {
                await handle.writeFile(JSON.stringify(snapshot));
                // On disk before the rename, so a power cut can't leave an empty store behind.
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
