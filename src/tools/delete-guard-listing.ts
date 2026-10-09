import { createEntriesClient } from '../api/endpoints/entries.js';
import { evaluateListedEntries, guardEntryQuery, ListedEntriesVerdict } from './delete-guard.js';
import logger from '../utils/logger.js';

/**
 * Lists entries carrying a tag or category over the guard window and returns the verdict.
 *
 * Fails closed like the count guard: if the listing cannot be read, the verdict is
 * 'unknown-entries' and the delete is refused.
 *
 * @param filter `{ tags: id }` or `{ categories: id }`
 * @returns The verdict on the listed entries
 */
export const listGuardEntries = async (
    filter: { tags: string } | { categories: string }
): Promise<ListedEntriesVerdict> => {
    try {
        const entriesClient = await createEntriesClient();
        const { entries } = await entriesClient.listEntriesPage(guardEntryQuery(filter));
        return evaluateListedEntries(entries);
    } catch (error) {
        logger.error('Delete guard could not list entries', { filter, message: (error as Error).message });
        return { allowed: false, reason: 'unknown-entries' };
    }
};
