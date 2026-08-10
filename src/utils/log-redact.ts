import winston from 'winston';

/**
 * Redaction for anything handed to the logger.
 *
 * The server authenticates with a `TOSHL_API_TOKEN` that reaches the user's real financial
 * data, and it is a stdio MCP server whose stderr is routinely captured to a log file by the
 * client. So a credential reaching a log line is a credential on disk.
 *
 * The hazard is specific and easy to hit: axios attaches the outgoing request config to both
 * responses and errors, and `AxiosError.toJSON()` includes that config — headers and all. A
 * call as ordinary as `logger.error('...', { error })` therefore writes
 * `config.headers.Authorization` (the base64 Basic credential) straight into the log.
 *
 * Fixing this at every call site would mean touching ~35 of them and would regress the first
 * time someone adds a thirty-sixth. Redacting once, here, covers all of them and anything
 * added later.
 */

const REDACTED = '[redacted]';

/** Keys whose value is a credential regardless of what object it appears on. */
const SENSITIVE_KEY =
    /^(authorization|proxy-authorization|www-authenticate|auth|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|x-api-key|client[_-]?secret|password|passwd|secret|credential|cookie|set-cookie)$/i;

/** Bounds the walk so a deep or hostile object cannot stall the logger. */
const MAX_DEPTH = 8;

/**
 * Returns a log-safe copy of a value: sensitive keys replaced, cycles broken, depth bounded.
 * The input is never mutated — callers keep working with the real object.
 * @param value Value to sanitize
 * @param depth Current recursion depth
 * @param ancestors Objects currently being walked, for cycle detection
 * @returns A structurally similar value with credentials removed
 */
export function sanitizeForLog(value: unknown, depth = 0, ancestors = new Set<unknown>()): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (depth > MAX_DEPTH) {
        return '[truncated]';
    }
    if (ancestors.has(value)) {
        return '[circular]';
    }

    const node = value as Record<string, unknown> & { toJSON?: () => unknown };

    // `AxiosError` and `AxiosHeaders` both define toJSON, and it is what winston's serializer
    // would call anyway. Normalizing through it first turns them into plain objects, so the
    // key matching below can actually see the headers nested inside `config`.
    if (typeof node.toJSON === 'function') {
        try {
            const plain = node.toJSON();
            if (plain !== value) {
                return sanitizeForLog(plain, depth, ancestors);
            }
        } catch {
            // A throwing toJSON is not a reason to lose the log line.
        }
    }

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((item) => sanitizeForLog(item, depth + 1, ancestors));
        }

        // An Error without toJSON serializes to `{}` under JSON.stringify, which is how
        // useful failures become silent. Keep the parts that aid debugging.
        if (value instanceof Error) {
            const code = (value as unknown as { code?: unknown }).code;
            return {
                name: value.name,
                message: value.message,
                stack: value.stack,
                ...(typeof code === 'string' ? { code } : {}),
            };
        }

        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(node)) {
            // Methods are not loggable data, and copying one across would be actively
            // harmful: a `toJSON` that throws would be carried into the sanitized object
            // and blow up the serializer, losing the log line this function exists to keep.
            if (typeof item === 'function') {
                continue;
            }
            out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeForLog(item, depth + 1, ancestors);
        }
        return out;
    } finally {
        ancestors.delete(value);
    }
}

/**
 * Winston format that redacts credentials from every log entry's metadata.
 * Applied at logger level so it runs before any transport formatting.
 */
export const redactSensitive = winston.format((info) => {
    for (const key of Object.keys(info)) {
        if (key === 'level') {
            continue;
        }
        const current = (info as Record<string, unknown>)[key];
        (info as Record<string, unknown>)[key] = SENSITIVE_KEY.test(key)
            ? REDACTED
            : sanitizeForLog(current);
    }
    return info;
});
