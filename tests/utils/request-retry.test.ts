import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToshlApiClient } from '../../src/api/toshl-client.js';
import { AuthProvider, AuthType } from '../../src/api/auth.js';

// Toshl answers slowly often enough that a single 10s attempt turns a working account into a
// failed tool call: `Network error: timeout of 10000ms exceeded`, seen on account_list and
// entry_list. A read that never reached Toshl is safe to send again, so the client retries it.
// A write is not: the create may have landed before the client gave up, so it must be reported,
// never repeated.
//
// The axios adapter is replaced so no request leaves the process, and the token is fake.

type Reply = { status: number; data?: unknown; headers?: Record<string, string> } | 'timeout';

const timeoutError = (config: InternalAxiosRequestConfig) =>
    new AxiosError(
        `timeout of ${config.timeout}ms exceeded`,
        AxiosError.ECONNABORTED,
        config,
        {},
    );

const clientWithReplies = (replies: Reply[], retries = 1) => {
    const client = new ToshlApiClient(
        { baseUrl: 'https://api.toshl.com', token: 'test-token', retries, retryDelayMs: 0 },
        new AuthProvider({ type: AuthType.BASIC, token: 'test-token' }),
    );
    const seen: InternalAxiosRequestConfig[] = [];

    (client as any).client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        seen.push(config);
        const reply = replies.shift();
        if (!reply) {
            throw new Error('unexpected request');
        }
        if (reply === 'timeout') {
            throw timeoutError(config);
        }

        const response = { ...reply, headers: reply.headers ?? {}, statusText: '', config, request: {} };
        if (reply.status >= 300) {
            throw new AxiosError(
                `Request failed with status code ${reply.status}`,
                AxiosError.ERR_BAD_REQUEST,
                config,
                {},
                response as any,
            );
        }
        return response;
    };

    return { client, seen };
};

describe('transient request failures', () => {
    test('a GET that times out once is sent again and succeeds', async () => {
        const { client, seen } = clientWithReplies(['timeout', { status: 200, data: [{ id: 'a' }] }]);

        const response = await client.get('/accounts');

        expect(response.data).toEqual([{ id: 'a' }]);
        expect(seen).toHaveLength(2);
    });

    test('a GET that keeps timing out reports the attempts and that it can be retried', async () => {
        const { client, seen } = clientWithReplies(['timeout', 'timeout'], 1);

        const error: McpError = await client.get('/accounts').catch((e) => e);

        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.ConnectionClosed);
        expect(error.message).toContain('timeout');
        expect(error.message).toContain('2 attempts');
        expect(error.message).toMatch(/can be retried/i);
        expect(seen).toHaveLength(2);
    });

    test('a GET gets another attempt after a 503', async () => {
        const { client, seen } = clientWithReplies([
            { status: 503, data: { id: 'unavailable', description: 'Service unavailable.' } },
            { status: 200, data: [{ id: 'b' }] },
        ]);

        const response = await client.get('/accounts');

        expect(response.data).toEqual([{ id: 'b' }]);
        expect(seen).toHaveLength(2);
    });

    test('a GET that Toshl refuses is not sent again', async () => {
        const { client, seen } = clientWithReplies([
            { status: 400, data: { id: 'invalid_query', description: 'Invalid query parameter.' } },
        ]);

        const error: McpError = await client.get('/entries', { per_page: 9999 }).catch((e) => e);

        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(seen).toHaveLength(1);
    });

    test('a POST that times out is never sent again and warns that it may have landed', async () => {
        const { client, seen } = clientWithReplies(['timeout']);

        const error: McpError = await client.post('/entries', { amount: -1 }).catch((e) => e);

        expect(error).toBeInstanceOf(McpError);
        expect(error.message).toContain('timeout');
        expect(error.message).toMatch(/may still have been applied/i);
        expect(error.message).not.toMatch(/can be retried/i);
        expect(seen).toHaveLength(1);
    });

    test('a PUT that Toshl could not reach is not sent again', async () => {
        const { client, seen } = clientWithReplies(['timeout']);

        await client.put('/entries/1', { amount: -1 }).catch(() => undefined);

        expect(seen).toHaveLength(1);
    });

    test('a rate-limited request reports how long Toshl asked the caller to wait', async () => {
        const { client, seen } = clientWithReplies([
            { status: 429, data: { id: 'too_many_requests' }, headers: { 'retry-after': '42' } },
        ]);

        const error: McpError = await client.get('/entries').catch((e) => e);

        expect(error.message).toContain('42');
        expect(seen).toHaveLength(1);
    });
});

describe('a 400 on a write that names no field', () => {
    test('points the caller at the id lookups', async () => {
        const { client } = clientWithReplies([
            { status: 400, data: { id: 'data_error', description: 'Data error.' } },
        ]);

        const error: McpError = await client
            .post('/entries', { amount: 318.75, category: 'reconciliation' })
            .catch((e) => e);

        expect(error.code).toBe(ErrorCode.InvalidParams);
        expect(error.message).toContain('Data error.');
        expect(error.message).toContain('category_list');
    });

    test('says nothing extra when Toshl did name the fields', async () => {
        const { client } = clientWithReplies([
            {
                status: 400,
                data: {
                    id: 'input_error',
                    description: 'Could not insert expense.',
                    fields: [{ field: 'amount', error: 'Amount cannot be zero.' }],
                },
            },
        ]);

        const error: McpError = await client.post('/entries', { amount: 0 }).catch((e) => e);

        expect(error.message).toContain('Amount cannot be zero.');
        expect(error.message).not.toContain('category_list');
    });
});
