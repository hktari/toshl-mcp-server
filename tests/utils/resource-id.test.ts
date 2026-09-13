import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { assertResourceId } from '../../src/utils/resource-id.js';

describe('assertResourceId', () => {
    test.each(['123', '73101634', 'abc-DEF_09'])('accepts %s and returns it unchanged', (id) => {
        expect(assertResourceId(id)).toBe(id);
    });

    test.each([
        ['query injection', '123?delete=all'],
        ['path traversal', '../categories/5'],
        ['encoded slash', '123%2F456'],
        ['embedded slash', '1/2'],
        ['whitespace', '12 3'],
        ['fragment', '1#x'],
    ])('rejects %s with an InvalidParams McpError', (_label, id) => {
        expect(() => assertResourceId(id)).toThrow(McpError);
        try {
            assertResourceId(id);
        } catch (error) {
            expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
            // The offending value must not be echoed back verbatim into the model's context.
            expect((error as McpError).message).not.toContain(id);
        }
    });

    test.each(['', undefined, null, 42, {}])('rejects empty or non-string %p', (id) => {
        expect(() => assertResourceId(id as any)).toThrow(McpError);
    });
});
