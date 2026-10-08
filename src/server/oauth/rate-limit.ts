/**
 * In-memory rate limiting for the OAuth endpoints. State resets on restart, which an
 * attacker can't trigger.
 */

const MINUTE = 60 * 1000;

/** Upper bound on tracked keys, so a flood of distinct IPs can't grow memory without limit. */
const MAX_TRACKED_KEYS = 10_000;

export interface LockoutPolicy {
    /** Failures from one IP inside `ipWindowMs` that lock that IP out. */
    ipMaxFailures: number;
    ipWindowMs: number;
    ipLockoutMs: number;
    /** Failures from all IPs together inside `globalWindowMs` that close sign-in for everyone. */
    globalMaxFailures: number;
    globalWindowMs: number;
    globalLockoutMs: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
    ipMaxFailures: 5,
    ipWindowMs: 15 * MINUTE,
    ipLockoutMs: 15 * MINUTE,
    globalMaxFailures: 20,
    globalWindowMs: 60 * MINUTE,
    globalLockoutMs: 60 * MINUTE,
};

interface FailureWindow {
    failures: number[];
    lockedUntil: number;
}

/**
 * Tracks wrong passphrases per IP and in total. A lockout only stops new sign-ins; tokens
 * already issued keep working.
 */
export class SignInLimiter {
    private readonly perIp = new Map<string, FailureWindow>();
    private readonly global: FailureWindow = { failures: [], lockedUntil: 0 };

    constructor(private readonly policy: LockoutPolicy = DEFAULT_LOCKOUT_POLICY) {}

    /**
     * Checks whether a sign-in attempt from this IP may proceed
     * @param ip Client IP
     * @param now Current time
     * @returns Seconds until retry when locked out, or 0 when allowed
     */
    retryAfterSeconds(ip: string, now = Date.now()): number {
        const lockedUntil = Math.max(this.global.lockedUntil, this.perIp.get(ip)?.lockedUntil ?? 0);
        return lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
    }

    /**
     * Records a wrong passphrase
     * @param ip Client IP
     * @param now Current time
     * @returns Which lockouts this failure started, for logging
     */
    recordFailure(ip: string, now = Date.now()): { ipLocked: boolean; globalLocked: boolean } {
        if (!this.perIp.has(ip) && this.perIp.size >= MAX_TRACKED_KEYS) {
            this.prune(now);
        }
        const window = this.perIp.get(ip) ?? { failures: [], lockedUntil: 0 };
        this.perIp.set(ip, window);

        const ipLocked = this.add(window, now, this.policy.ipWindowMs, this.policy.ipMaxFailures, this.policy.ipLockoutMs);
        const globalLocked = this.add(
            this.global,
            now,
            this.policy.globalWindowMs,
            this.policy.globalMaxFailures,
            this.policy.globalLockoutMs
        );
        return { ipLocked, globalLocked };
    }

    /**
     * Clears an IP's failures after a correct passphrase
     * @param ip Client IP
     */
    recordSuccess(ip: string): void {
        this.perIp.delete(ip);
    }

    private add(window: FailureWindow, now: number, windowMs: number, max: number, lockoutMs: number): boolean {
        window.failures = window.failures.filter((at) => at > now - windowMs);
        window.failures.push(now);
        if (window.failures.length >= max && window.lockedUntil <= now) {
            window.lockedUntil = now + lockoutMs;
            window.failures = [];
            return true;
        }
        return false;
    }

    private prune(now: number) {
        for (const [ip, window] of this.perIp) {
            if (window.lockedUntil <= now && window.failures.every((at) => at <= now - this.policy.ipWindowMs)) {
                this.perIp.delete(ip);
            }
        }
        // Still full of live entries: drop the oldest rather than grow.
        while (this.perIp.size >= MAX_TRACKED_KEYS) {
            const oldest = this.perIp.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.perIp.delete(oldest);
        }
    }
}

/**
 * Fixed-window request counter per IP, for the token and revocation endpoints.
 */
export class RequestLimiter {
    private readonly counts = new Map<string, { windowStart: number; count: number }>();

    constructor(
        private readonly maxPerWindow: number,
        private readonly windowMs = MINUTE
    ) {}

    /**
     * Counts a request and says whether it is within the limit
     * @param ip Client IP
     * @param now Current time
     * @returns Whether the request may proceed
     */
    allow(ip: string, now = Date.now()): boolean {
        let entry = this.counts.get(ip);
        if (!entry || entry.windowStart <= now - this.windowMs) {
            if (!entry && this.counts.size >= MAX_TRACKED_KEYS) {
                for (const [key, value] of this.counts) {
                    if (value.windowStart <= now - this.windowMs) {
                        this.counts.delete(key);
                    }
                }
                // Still full: evict the oldest rather than refuse every new client, which
                // would let a flood of addresses lock legitimate ones out.
                while (this.counts.size >= MAX_TRACKED_KEYS) {
                    const oldest = this.counts.keys().next().value;
                    if (oldest === undefined) {
                        break;
                    }
                    this.counts.delete(oldest);
                }
            }
            entry = { windowStart: now, count: 0 };
            this.counts.set(ip, entry);
        }
        entry.count++;
        return entry.count <= this.maxPerWindow;
    }
}

/**
 * Turns a client address into a rate-limit key. IPv4 addresses are used whole; IPv6
 * addresses are cut to their /64, since one subscriber typically holds a whole /64 and
 * could otherwise rotate through addresses to dodge per-IP limits.
 * @param address Address from the socket or X-Forwarded-For
 * @returns The key, or undefined when the value is not an IP address
 */
export function rateLimitKey(address: string | undefined): string | undefined {
    if (!address) {
        return undefined;
    }

    let ip = address.trim();
    if (ip.startsWith('[') && ip.endsWith(']')) {
        ip = ip.slice(1, -1);
    }
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (mapped) {
        ip = mapped[1];
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
        return ip.split('.').every((octet) => Number(octet) <= 255) ? ip : undefined;
    }

    if (!ip.includes(':') || !/^[0-9a-f:]{2,39}$/i.test(ip)) {
        return undefined;
    }
    const halves = ip.split('::');
    if (halves.length > 2) {
        return undefined;
    }
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? head.length !== 8 : missing < 1) {
        return undefined;
    }
    const groups = [...head, ...new Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
        return undefined;
    }

    return `${groups
        .slice(0, 4)
        .map((group) => parseInt(group, 16).toString(16))
        .join(':')}::/64`;
}
