import { Writable } from 'node:stream';
import { AxiosError } from 'axios';
import winston from 'winston';
import { sanitizeForLog, redactSensitive } from '../../src/utils/log-redact.js';

// Deliberately shaped so it reads as a fixture rather than a credential: a realistic-looking
// token here would trip the repo's secret scanner on every PR that touches this file, and
// nothing in these tests depends on the value being plausible — only on it being distinctive.
const TOKEN = 'example-not-a-real-token-0000000000';
const BASIC = Buffer.from(`${TOKEN}:`).toString('base64');

/**
 * Builds the failure axios hands to a catch block: the outgoing request config, including
 * the Authorization header, is attached to the error.
 */
const axiosFailure = () =>
    new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', {
        url: '/categories',
        method: 'post',
        headers: { Authorization: `Basic ${BASIC}` },
    } as never);

/** Captures everything a logger actually writes, so assertions cover the real output. */
const captureLogger = () => {
    const written: string[] = [];
    const sink = new Writable({
        write(chunk, _enc, done) {
            written.push(String(chunk));
            done();
        },
    });

    const logger = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(redactSensitive(), winston.format.json()),
        defaultMeta: { service: 'toshl-mcp-server' },
        transports: [new winston.transports.Stream({ stream: sink })],
    });

    return { logger, output: () => written.join('') };
};

describe('log redaction', () => {
    describe('end to end through winston', () => {
        test('an axios failure does not put the token in the log output', () => {
            const { logger, output } = captureLogger();

            // The exact shape used at ~35 call sites across src/tools and src/resources.
            logger.error('Error handling category_create tool', {
                args: { name: 'Groceries' },
                error: axiosFailure(),
            });

            expect(output()).not.toContain(TOKEN);
            expect(output()).not.toContain(BASIC);
            expect(output()).toContain('[redacted]');
        });

        test('an axios response object does not put the token in the log output', () => {
            const { logger, output } = captureLogger();

            // Mirrors `logger.debug('Response', response)` in src/api/endpoints/entries.ts.
            logger.debug('Response', {
                status: 201,
                headers: { location: '/entries/42' },
                config: { headers: { Authorization: `Basic ${BASIC}` } },
            });

            expect(output()).not.toContain(BASIC);
            expect(output()).toContain('/entries/42');
        });

        test('diagnostic detail survives redaction', () => {
            const { logger, output } = captureLogger();

            logger.error('Error handling category_create tool', {
                args: { name: 'Groceries' },
                error: axiosFailure(),
            });

            const logged = output();
            expect(logged).toContain('Request failed with status code 401');
            expect(logged).toContain('ERR_BAD_REQUEST');
            expect(logged).toContain('/categories');
            expect(logged).toContain('Groceries');
        });
    });

    describe('sanitizeForLog', () => {
        test('redacts credential-bearing keys at any depth', () => {
            const result = sanitizeForLog({
                a: { b: { c: { authorization: 'Basic x', apiKey: 'k', password: 'p' } } },
            }) as Record<string, never>;

            expect(JSON.stringify(result)).not.toContain('Basic x');
            expect(JSON.stringify(result)).not.toContain('"k"');
            expect(JSON.stringify(result)).not.toContain('"p"');
        });

        test('matches key names case-insensitively and across separators', () => {
            const result = JSON.stringify(
                sanitizeForLog({ AUTHORIZATION: 'a', api_key: 'b', 'x-api-key': 'c', Token: 'd' }),
            );

            expect(result).not.toMatch(/"[abcd]"/);
        });

        test('leaves non-sensitive values untouched', () => {
            const input = { id: '42', name: 'Groceries', nested: { count: 3, tags: ['a', 'b'] } };

            expect(sanitizeForLog(input)).toEqual(input);
        });

        test('does not mutate the value it was given', () => {
            const error = axiosFailure();

            sanitizeForLog(error);

            expect((error.config?.headers as unknown as Record<string, string>).Authorization).toBe(
                `Basic ${BASIC}`,
            );
        });

        test('survives circular references', () => {
            const node: Record<string, unknown> = { name: 'root' };
            node.self = node;

            expect(() => JSON.stringify(sanitizeForLog(node))).not.toThrow();
            expect(JSON.stringify(sanitizeForLog(node))).toContain('[circular]');
        });

        test('bounds deeply nested structures', () => {
            let deep: Record<string, unknown> = { end: true };
            for (let i = 0; i < 50; i++) {
                deep = { next: deep };
            }

            expect(JSON.stringify(sanitizeForLog(deep))).toContain('[truncated]');
        });

        test('keeps plain Errors readable instead of serializing them to {}', () => {
            const result = sanitizeForLog(new Error('boom')) as Record<string, string>;

            expect(result.message).toBe('boom');
            expect(result.name).toBe('Error');
        });

        test('tolerates a throwing toJSON', () => {
            const hostile = {
                toJSON() {
                    throw new Error('nope');
                },
                token: 'secret-value',
            };

            expect(() => sanitizeForLog(hostile)).not.toThrow();
            expect(JSON.stringify(sanitizeForLog(hostile))).not.toContain('secret-value');
        });
    });
});
