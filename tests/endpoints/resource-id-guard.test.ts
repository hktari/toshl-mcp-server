import { jest } from '@jest/globals';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { EntriesClient } from '../../src/api/endpoints/entries.js';
import { CategoriesClient } from '../../src/api/endpoints/categories.js';
import { TagsClient } from '../../src/api/endpoints/tags.js';
import { AccountsClient } from '../../src/api/endpoints/accounts.js';
import { BudgetsClient } from '../../src/api/endpoints/budgets.js';
import { PlanningClient } from '../../src/api/endpoints/planning.js';

// Credential-free: exercises the endpoint modules against a stub HTTP client, so it
// runs in CI unlike the live suites next to it.

const stubClient = () => ({
    get: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ data: {}, status: 200, headers: {} }),
    put: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ data: {}, status: 200, headers: {} }),
    post: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ data: {}, status: 200, headers: {} }),
    delete: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ data: undefined, status: 204, headers: {} }),
});

const CRAFTED_ID = '123?delete=all';

describe('resource ids are validated before reaching a URL path', () => {
    test.each([
        ['EntriesClient.getEntry', (c: any) => new EntriesClient(c).getEntry(CRAFTED_ID)],
        ['EntriesClient.updateEntry', (c: any) => new EntriesClient(c).updateEntry(CRAFTED_ID, {})],
        ['EntriesClient.deleteEntry', (c: any) => new EntriesClient(c).deleteEntry(CRAFTED_ID)],
        ['CategoriesClient.getCategory', (c: any) => new CategoriesClient(c).getCategory(CRAFTED_ID)],
        ['CategoriesClient.updateCategory', (c: any) => new CategoriesClient(c).updateCategory(CRAFTED_ID, {})],
        ['CategoriesClient.deleteCategory', (c: any) => new CategoriesClient(c).deleteCategory(CRAFTED_ID)],
        ['TagsClient.getTag', (c: any) => new TagsClient(c).getTag(CRAFTED_ID)],
        ['TagsClient.updateTag', (c: any) => new TagsClient(c).updateTag(CRAFTED_ID, {})],
        ['TagsClient.deleteTag', (c: any) => new TagsClient(c).deleteTag(CRAFTED_ID)],
        ['AccountsClient.getAccount', (c: any) => new AccountsClient(c).getAccount(CRAFTED_ID)],
        ['BudgetsClient.getBudget', (c: any) => new BudgetsClient(c).getBudget(CRAFTED_ID)],
        ['BudgetsClient.getBudgetHistory', (c: any) => new BudgetsClient(c).getBudgetHistory(CRAFTED_ID)],
        ['PlanningClient.getPlanningById', (c: any) => new PlanningClient(c).getPlanningById(CRAFTED_ID)],
    ])('%s rejects a crafted id without any HTTP call', async (_name, call) => {
        const client = stubClient();

        await expect(call(client)).rejects.toBeInstanceOf(McpError);

        expect(client.get).not.toHaveBeenCalled();
        expect(client.put).not.toHaveBeenCalled();
        expect(client.post).not.toHaveBeenCalled();
        expect(client.delete).not.toHaveBeenCalled();
    });

    test('a well-formed id is used verbatim in the path', async () => {
        const client = stubClient();

        await new EntriesClient(client as any).deleteEntry('987', 'one');

        expect(client.delete).toHaveBeenCalledWith('/entries/987', { delete: 'one' });
    });
});
