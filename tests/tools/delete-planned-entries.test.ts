import { jest } from '@jest/globals';

// Stand in for the Toshl API client so the delete handlers can be exercised without
// credentials. Requests are routed by path so each test can say what the tag or
// category, and the entries listing, look like.
const mockGet = jest.fn<(...args: any[]) => Promise<any>>();
const mockDelete = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock('../../src/api/toshl-client.js', () => ({
    __esModule: true,
    default: { get: mockGet, delete: mockDelete },
    ToshlApiClient: class {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleTagDeleteTool } = require('../../src/tools/tag-tools.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleCategoryDeleteTool } = require('../../src/tools/category-tools.js');

const apiResponse = (data: unknown) => ({ data, status: 200, headers: {} });

const entriesCalls = () => mockGet.mock.calls.filter((call) => call[0] === '/entries');

/**
 * Routes GETs: the resource itself reports zero entries, and /entries answers with
 * `listing` (or rejects with it, when it is an Error).
 */
const stubApi = (resourcePath: string, listing: unknown[] | Error) => {
    mockGet.mockImplementation(async (url: unknown) => {
        if (url === resourcePath) {
            return apiResponse({ id: 'x', name: 'Planned only', modified: '2026-10-02T10:00:00Z', counts: { entries: 0 } });
        }
        if (url === '/entries') {
            if (listing instanceof Error) {
                throw listing;
            }
            return apiResponse(listing);
        }
        throw new Error(`unexpected GET ${String(url)}`);
    });
    mockDelete.mockResolvedValue({ data: undefined, status: 204, headers: {} });
};

const cases = [
    {
        tool: 'tag_delete',
        handle: (args: any) => handleTagDeleteTool(args),
        resourcePath: '/tags/86596568',
        id: '86596568',
        filter: 'tags',
    },
    {
        tool: 'category_delete',
        handle: (args: any) => handleCategoryDeleteTool(args),
        resourcePath: '/categories/4242',
        id: '4242',
        filter: 'categories',
    },
];

describe.each(cases)('$tool guard against planned entries', ({ handle, resourcePath, id, filter }) => {
    beforeEach(() => {
        mockGet.mockReset();
        mockDelete.mockReset();
    });

    test('count 0 but the listing finds an entry → refused, no DELETE, entry named', async () => {
        stubApi(resourcePath, [{ id: 'e1', date: '2026-10-13' }]);

        const result = await handle({ id });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('at least 1 entries');
        expect(result.content[0].text).toContain('e1 (2026-10-13)');
        expect(result.content[0].text).toContain('force: true');
        expect(mockDelete).not.toHaveBeenCalled();
    });

    test('count 0 and an empty listing → deleted', async () => {
        stubApi(resourcePath, []);

        const result = await handle({ id });

        expect(result.isError).toBeUndefined();
        expect(mockDelete).toHaveBeenCalledWith(resourcePath);
    });

    test('count 0 and the listing fails → refused, no DELETE', async () => {
        stubApi(resourcePath, new Error('Network error: socket hang up'));

        const result = await handle({ id });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('force: true');
        expect(mockDelete).not.toHaveBeenCalled();
    });

    test('force: true → no listing, deleted', async () => {
        stubApi(resourcePath, [{ id: 'e1', date: '2026-10-13' }]);

        const result = await handle({ id, force: true });

        expect(result.isError).toBeUndefined();
        expect(entriesCalls()).toHaveLength(0);
        expect(mockDelete).toHaveBeenCalledWith(resourcePath);
    });

    test('the listing carries the id and the guard window', async () => {
        stubApi(resourcePath, []);

        await handle({ id });

        expect(entriesCalls()).toEqual([
            ['/entries', { [filter]: id, from: '2000-01-01', to: '2099-12-31', per_page: 10 }],
        ]);
    });
});
