import { jest } from '@jest/globals';

// Stand in for the Toshl API client so the entry_list handler can be exercised
// without credentials. Only `get` is used by listEntries.
const mockGet = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock('../../src/api/toshl-client.js', () => ({
    __esModule: true,
    default: { get: mockGet },
    ToshlApiClient: class {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleEntryListTool, setupEntryTools } = require('../../src/tools/entry-tools.js');

const apiResponse = (data: unknown, link?: string) => ({
    data,
    status: 200,
    headers: link ? { link } : {},
});

const entry = (id: string) => ({ id, amount: -1, currency: { code: 'EUR' }, date: '2024-01-15' });

const parseResult = (result: any) => JSON.parse(result.content[0].text);

describe('entry_list pagination', () => {
    beforeEach(() => {
        mockGet.mockReset();
    });

    test('schema exposes page and per_page as bounded integers', () => {
        const tool = setupEntryTools().find((t: any) => t.name === 'entry_list');
        const { page, per_page } = tool.inputSchema.properties;

        expect(page).toMatchObject({ type: 'integer', minimum: 0 });
        expect(per_page).toMatchObject({ type: 'integer', minimum: 1, maximum: 500 });
        expect(tool.inputSchema.required).toEqual(['from', 'to']);
    });

    test('forwards page and per_page to the API', async () => {
        mockGet.mockResolvedValue(apiResponse([]));

        await handleEntryListTool({ from: '2024-01-01', to: '2024-01-31', page: 2, per_page: 50 });

        expect(mockGet).toHaveBeenCalledWith('/entries', expect.objectContaining({ page: 2, per_page: 50 }));
    });

    test('wraps entries with pagination metadata and reports the next page', async () => {
        mockGet.mockResolvedValue(apiResponse(
            [entry('a'), entry('b')],
            '<https://api.toshl.com/entries?from=2024-01-01&to=2024-01-31&page=1&per_page=2>; rel="next"',
        ));

        const result = await handleEntryListTool({ from: '2024-01-01', to: '2024-01-31', per_page: 2 });

        expect(result.isError).toBeUndefined();
        expect(parseResult(result)).toEqual({
            entries: [entry('a'), entry('b')],
            page: 0,
            per_page: 2,
            count: 2,
            next_page: 1,
        });
    });

    test('reports next_page null on the last page', async () => {
        mockGet.mockResolvedValue(apiResponse([entry('z')], '<https://api.toshl.com/entries?page=2>; rel="prev"'));

        const result = await handleEntryListTool({ from: '2024-01-01', to: '2024-01-31', page: 3 });

        expect(parseResult(result)).toMatchObject({ page: 3, count: 1, next_page: null });
    });

    test('defaults to page 0 and per_page 200 when omitted', async () => {
        mockGet.mockResolvedValue(apiResponse([]));

        const result = await handleEntryListTool({ from: '2024-01-01', to: '2024-01-31' });

        expect(mockGet).toHaveBeenCalledWith('/entries', expect.objectContaining({ page: 0, per_page: 200 }));
        expect(parseResult(result)).toMatchObject({ page: 0, per_page: 200 });
    });

    test.each([
        ['per_page above 500', { per_page: 501 }],
        ['per_page below 1', { per_page: 0 }],
        ['fractional per_page', { per_page: 2.5 }],
        ['negative page', { page: -1 }],
        ['non-numeric page', { page: 'two' }],
    ])('rejects %s without calling the API', async (_label, bad) => {
        const result = await handleEntryListTool({ from: '2024-01-01', to: '2024-01-31', ...bad });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/page/i);
        expect(mockGet).not.toHaveBeenCalled();
    });
});
