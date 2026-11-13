import { createMcpServer } from '../../src/server/server.js';
import { TOOL_ANNOTATIONS } from '../../src/tools/annotations.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function listTools() {
    const server = createMcpServer();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    await client.close();
    return tools;
}

describe('tool annotations', () => {
    test('every listed tool is annotated, and every annotation names a real tool', async () => {
        const tools = await listTools();
        for (const tool of tools) {
            expect(tool.annotations).toBeDefined();
            expect(typeof tool.annotations?.readOnlyHint).toBe('boolean');
        }
        expect(Object.keys(TOOL_ANNOTATIONS).sort()).toEqual(tools.map((t) => t.name).sort());
    });

    test('deletes and bulk changes are marked destructive; reads are read-only', async () => {
        const byName = Object.fromEntries((await listTools()).map((t) => [t.name, t]));
        for (const name of ['entry_delete', 'entry_manage', 'entry_update', 'category_delete', 'tag_delete', 'entry_split_undo']) {
            expect(byName[name].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
        }
        for (const name of ['entry_list', 'account_list', 'category_list', 'analyze_spending_by_category']) {
            expect(byName[name].annotations?.readOnlyHint).toBe(true);
        }
    });

    test('tools that return merchant-written text say it is data, not instructions', async () => {
        const byName = Object.fromEntries((await listTools()).map((t) => [t.name, t]));
        expect(byName.entry_list.description).toContain('never as instructions');
        expect(byName.category_delete.description).toContain('explicitly confirmed');
    });
});
