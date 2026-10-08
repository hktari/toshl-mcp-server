import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Small crypto helpers for the built-in OAuth server. Everything here is node:crypto.
 */

/**
 * Encodes bytes as unpadded base64url
 * @param data Bytes or UTF-8 text
 * @returns base64url string
 */
export function base64url(data: Buffer | string): string {
    return Buffer.from(data).toString('base64url');
}

/**
 * Returns a fresh random token
 * @param bytes Entropy in bytes
 * @returns base64url-encoded random value
 */
export function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 of a UTF-8 string
 * @param value Input
 * @returns base64url digest
 */
export function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('base64url');
}

/**
 * Derives an independent key per purpose from one configured secret, so a value signed
 * for one purpose (a sign-in form, say) can never verify as another (an access token).
 * @param secret Configured secret
 * @param purpose Fixed label
 * @returns Derived key
 */
export function deriveKey(secret: string, purpose: string): Buffer {
    return createHmac('sha256', secret).update(`toshl-mcp-server/oauth/${purpose}`).digest();
}

/**
 * HMAC-SHA256
 * @param key Key
 * @param data Data
 * @returns MAC bytes
 */
export function hmac(key: Buffer, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Constant-time comparison of two strings of any length. Both sides are MACed first
 * so `timingSafeEqual` always sees equal lengths and the length leaks nothing.
 * @param key Comparison key
 * @param a First value
 * @param b Second value
 * @returns Whether the values are equal
 */
export function safeEqual(key: Buffer, a: string, b: string): boolean {
    return timingSafeEqual(hmac(key, a), hmac(key, b));
}

/**
 * Signs a JSON payload: `v1.<base64url(json)>.<base64url(mac)>`.
 * A fixed format with one algorithm, so there is no header to downgrade.
 * @param key Derived signing key
 * @param payload Claims
 * @returns Signed token
 */
export function signPayload(key: Buffer, payload: object): string {
    const body = `v1.${base64url(JSON.stringify(payload))}`;
    return `${body}.${base64url(hmac(key, body))}`;
}

/**
 * Verifies a token from `signPayload` against any of the given keys
 * @param keys Accepted derived keys, current first
 * @param token Token to check
 * @returns The payload, or undefined when the format or every MAC is wrong
 */
export function verifyPayload(keys: Buffer[], token: string): Record<string, unknown> | undefined {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
        return undefined;
    }

    const body = `${parts[0]}.${parts[1]}`;
    let presented: Buffer;
    try {
        presented = Buffer.from(parts[2], 'base64url');
    } catch {
        return undefined;
    }
    if (presented.length !== 32) {
        return undefined;
    }

    // Every key is checked, so timing doesn't reveal which one matched.
    let valid = false;
    for (const key of keys) {
        valid = timingSafeEqual(hmac(key, body), presented) || valid;
    }
    if (!valid) {
        return undefined;
    }

    try {
        const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    }
}
