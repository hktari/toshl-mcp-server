import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ToshlApiClient } from '../../src/api/toshl-client.js';
import { AuthProvider, AuthType } from '../../src/api/auth.js';
import { createEntriesClient } from '../../src/api/endpoints/entries.js';
import { createCategoriesClient } from '../../src/api/endpoints/categories.js';
import { createTagsClient } from '../../src/api/endpoints/tags.js';

// Creating a resource is a POST followed by a GET of the new id. When Toshl accepts the POST
// but the read-back fails, the create did happen, and a caller told only "the request failed"
// sends it again — a duplicate entry in the user's ledger. So the failure has to name the id
// that now exists and say not to repeat the create.
//
// The axios adapter is replaced so no request leaves the process, and the token is fake.

type Reply = { status: number; data?: unknown; headers?: Record<string, string> } | 'timeout';

const clientWithReplies = (replies: Reply[]) => {
    const client = new ToshlApiClient(
        { baseUrl: 'https://api.toshl.com', token: 'test-token', retries: 0, retryDelayMs: 0 },
        new AuthProvider({ type: AuthType.BASIC, token: 'test-token' }),
    );

    (client as any).client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        const reply = replies.shift();
        if (!reply) {
            throw new Error('unexpected request');
        }
        if (reply === 'timeout') {
            throw new AxiosError(`timeout of ${config.timeout}ms exceeded`, AxiosError.ECONNABORTED, config, {});
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

    return client;
};

describe('a create whose read-back fails', () => {
    test('entry_create names the entry that exists and says not to create it again', async () => {
        const client = clientWithReplies([
            { status: 201, headers: { location: '/entries/987654' } },
            'timeout',
        ]);
        const entries = await createEntriesClient(client);

        const error: Error = await entries
            .createEntry({ amount: -12, date: '2026-11-17' } as any)
            .catch((e) => e);

        expect(error.message).toContain('987654');
        expect(error.message).toMatch(/was created/i);
        expect(error.message).toMatch(/not .*again|instead of creating it again/i);
    });

    test('a created entry is returned normally when the read-back works', async () => {
        const client = clientWithReplies([
            { status: 201, headers: { location: '/entries/987654' } },
            { status: 200, data: { id: '987654', amount: -12 } },
        ]);
        const entries = await createEntriesClient(client);

        const entry = await entries.createEntry({ amount: -12, date: '2026-11-17' } as any);

        expect(entry).toEqual({ id: '987654', amount: -12 });
    });

    test('category_create names the category that exists', async () => {
        const client = clientWithReplies([
            { status: 201, headers: { location: '/categories/55' } },
            'timeout',
        ]);
        const categories = await createCategoriesClient(client);

        const error: Error = await categories.createCategory({ name: 'Test' } as any).catch((e) => e);

        expect(error.message).toContain('55');
        expect(error.message).toMatch(/was created/i);
    });

    test('tag_create names the tag that exists', async () => {
        const client = clientWithReplies([
            { status: 201, headers: { location: '/tags/77' } },
            'timeout',
        ]);
        const tags = await createTagsClient(client);

        const error: Error = await tags.createTag({ name: 'Test' } as any).catch((e) => e);

        expect(error.message).toContain('77');
        expect(error.message).toMatch(/was created/i);
    });
});
