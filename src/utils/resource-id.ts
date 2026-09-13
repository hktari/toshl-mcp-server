import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Shape of every Toshl resource id we interpolate into a URL path. Toshl ids are
 * numeric strings; the letters and separators are slack for any opaque ids the API
 * may introduce. Anything else — `/`, `?`, `#`, `%`, `..` — would let a caller-supplied
 * id rewrite the path or query of a request, so it is refused before a request exists.
 */
const RESOURCE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Asserts that a value is safe to use as a single URL path segment.
 * @param id Candidate resource id (from tool arguments or a resource URI)
 * @returns The same id, for use inline in a template path
 * @throws McpError InvalidParams if the id is missing or malformed
 */
export const assertResourceId = (id: unknown): string => {
    if (typeof id !== 'string' || !RESOURCE_ID.test(id)) {
        // Deliberately does not echo the value: it goes straight back into the model's context.
        throw new McpError(ErrorCode.InvalidParams, 'Invalid resource id: expected letters, digits, "_" or "-" only');
    }
    return id;
};
