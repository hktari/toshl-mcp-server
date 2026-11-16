import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Reads back a resource Toshl has just created.
 *
 * Toshl answers a create with a Location header and no body, so every create here is a POST
 * followed by a GET. Those are two requests, and the second one can fail on its own — a
 * timeout, a 503 — after the first has already changed the user's ledger. Reported as a plain
 * failure, that invites the caller to create the thing a second time, which in a ledger means
 * a duplicate the user has to find and delete. So the failure names the id that now exists
 * and says what to do with it instead.
 *
 * @param kind What was created, as the caller's tools name it, e.g. `entry`
 * @param id The id Toshl returned in the Location header
 * @param read Fetches the created resource
 * @returns The created resource
 * @throws McpError naming the created id when the read-back fails
 */
export const readBackCreated = async <T>(kind: string, id: string, read: () => Promise<T>): Promise<T> => {
    try {
        return await read();
    } catch (error) {
        throw new McpError(
            ErrorCode.InternalError,
            `The ${kind} was created with id ${id}, but reading it back failed `
            + `(${(error as Error).message}). It exists on Toshl: use ${kind} id ${id} `
            + 'instead of creating it again.'
        );
    }
};
