import { jest } from '@jest/globals';

// Stub the HTTP layer so the handler's whole create/delete/rollback sequence can be
// observed without credentials.
type Call = (...args: any[]) => Promise<any>;
const mockGet = jest.fn<Call>();
const mockPost = jest.fn<Call>();
const mockDelete = jest.fn<Call>();
jest.mock('../../src/api/toshl-client.js', () => ({
    __esModule: true,
    default: { get: mockGet, post: mockPost, delete: mockDelete },
    ToshlApiClient: class {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleEntryConvertToTransferTool } = require('../../src/tools/entry-tools.js');

const ok = (data: unknown, headers: Record<string, string> = {}) => ({ data, status: 200, headers });

const ORIGINAL = {
    id: '100', amount: -42, currency: { code: 'EUR' }, date: '2024-03-01',
    desc: 'ATM', account: 'acc-1', category: 'cat-food', tags: ['t1'], modified: 'x',
};
const CREATED = { ...ORIGINAL, id: '200', category: '555', transaction: { account: 'acc-2', currency: { code: 'EUR' } } };
const SYSTEM_CATEGORIES = [
    { id: '444', name: 'Something else', type: 'system' },
    { id: '555', name: 'Transfer', type: 'system' },
];

const routeGet = (categories: unknown) => mockGet.mockImplementation(async (path: string) => {
    if (path === '/categories') { return ok(categories); }
    if (path === '/entries/100') { return ok(ORIGINAL); }
    if (path === '/entries/200') { return ok(CREATED); }
    throw new Error(`unexpected GET ${path}`);
});

describe('entry_convert_to_transfer', () => {
    beforeEach(() => {
        mockGet.mockReset();
        mockPost.mockReset();
        mockDelete.mockReset();
    });

    test("uses the account's own system Transfer category instead of a hardcoded id", async () => {
        routeGet(SYSTEM_CATEGORIES);
        mockPost.mockResolvedValue(ok(null, { location: 'https://api.toshl.com/entries/200' }));
        mockDelete.mockResolvedValue(ok(undefined));

        const result = await handleEntryConvertToTransferTool({ id: '100', destination_account: 'acc-2' });

        expect(result.isError).toBeUndefined();
        expect(mockGet).toHaveBeenCalledWith('/categories', expect.objectContaining({ type: 'system' }));
        expect(mockPost).toHaveBeenCalledWith('/entries', expect.objectContaining({ category: '555' }));
        expect(mockPost.mock.calls[0][1].category).not.toBe('73101634');
        expect(mockDelete).toHaveBeenCalledWith('/entries/100', {});
    });

    test('refuses before writing anything when no system Transfer category exists', async () => {
        routeGet([{ id: '444', name: 'Something else', type: 'system' }]);

        const result = await handleEntryConvertToTransferTool({ id: '100', destination_account: 'acc-2' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/transfer.*category/i);
        expect(mockPost).not.toHaveBeenCalled();
        expect(mockDelete).not.toHaveBeenCalled();
    });

    test('rolls back the new transfer when deleting the original fails, and says so', async () => {
        routeGet(SYSTEM_CATEGORIES);
        mockPost.mockResolvedValue(ok(null, { location: 'https://api.toshl.com/entries/200' }));
        mockDelete.mockImplementation(async (path: string) => {
            if (path === '/entries/100') { throw new Error('boom'); }
            return ok(undefined);
        });

        const result = await handleEntryConvertToTransferTool({ id: '100', destination_account: 'acc-2' });

        expect(result.isError).toBe(true);
        expect(mockDelete).toHaveBeenCalledWith('/entries/200', {});
        expect(result.content[0].text).toMatch(/original entry 100 was kept/i);
    });

    test('reports both ids when the rollback itself fails so the user can clean up', async () => {
        routeGet(SYSTEM_CATEGORIES);
        mockPost.mockResolvedValue(ok(null, { location: 'https://api.toshl.com/entries/200' }));
        mockDelete.mockRejectedValue(new Error('boom'));

        const result = await handleEntryConvertToTransferTool({ id: '100', destination_account: 'acc-2' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('100');
        expect(result.content[0].text).toContain('200');
    });
});
