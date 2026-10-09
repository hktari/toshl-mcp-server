/**
 * Shared entry-count guard for the destructive category/tag delete tools.
 *
 * Deleting a category or a tag is not reversible from this server, and Toshl documents
 * the side effects only as "some related data is updated asynchronously" — it does not
 * say what becomes of the entries filed under the thing being deleted. So the guard is
 * the whole safety story for those tools, and it is written to fail CLOSED: a count that
 * cannot be read is treated exactly like a non-zero one.
 *
 * That distinction is the point. Reading a missing field as "0 entries" would leave a
 * guard that looks protective, reads as protective in the tool description, and silently
 * does nothing.
 *
 * What it does NOT protect against: the count is read by one request and the delete is
 * sent by another, so an entry filed in between passes the check and is deleted anyway.
 * Closing that would need a conditional delete, which Toshl does not offer. The guard is
 * a guard against the obvious mistake, not a transaction.
 */

/**
 * Reads how many entries a category or tag is used on.
 *
 * The two sources Toshl publishes disagree for tags: the schema vendored at
 * `docs/api/schema/tag-schema.json` (served from api.toshl.com/schema/tag#) requires
 * `counts.entries`, while the example response on the GET /tags/:id docs page shows a
 * flat `count`. Categories only ever document `counts.entries`. Accept either, and
 * report undefined when neither is a usable number.
 *
 * @param resource Category or tag payload from the API
 * @returns Entry count, or undefined if it could not be determined
 */
export function readEntryCount(resource: unknown): number | undefined {
    if (typeof resource !== 'object' || resource === null) {
        return undefined;
    }

    const { counts, count } = resource as { counts?: unknown; count?: unknown };

    if (typeof counts === 'object' && counts !== null) {
        const entries = (counts as { entries?: unknown }).entries;
        if (isUsableCount(entries)) {
            return entries;
        }
    }

    return isUsableCount(count) ? count : undefined;
}

/** Why a delete was refused, or that it may go ahead. */
export type DeleteVerdict =
    | { allowed: true }
    | { allowed: false; reason: 'unknown-count' }
    | { allowed: false; reason: 'has-entries'; entryCount: number };

/**
 * Decides whether a delete may go ahead.
 *
 * @param entryCount Entry count as read by readEntryCount, or undefined if unknown
 * @param force Whether the caller explicitly opted into deleting anyway
 * @returns The verdict, carrying the entry count when that is what blocked it
 */
export function evaluateDelete(entryCount: number | undefined, force?: boolean): DeleteVerdict {
    if (force) {
        return { allowed: true };
    }

    if (entryCount === undefined) {
        return { allowed: false, reason: 'unknown-count' };
    }

    if (entryCount > 0) {
        return { allowed: false, reason: 'has-entries', entryCount };
    }

    return { allowed: true };
}

/**
 * A count is only usable if it is a real, non-negative integer. NaN, Infinity and
 * negatives mean something went wrong upstream, and "something went wrong" must not
 * read as "nothing to protect".
 */
function isUsableCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/*
 * Planned entries.
 *
 * Toshl's entry count was observed (2026-10-07) to leave out entries that were dated in
 * the future when they were written, and not to recount them once their date arrives.
 * A tag used only on such entries reads as "0 entries", and the count guard alone would
 * let it be deleted. So when the count allows a delete, the handlers also list entries
 * carrying the tag or category over a wide fixed window, and refuse if any come back.
 */

/** Start of the window the entry listing covers */
export const GUARD_FROM = '2000-01-01';

/** End of the window the entry listing covers */
export const GUARD_TO = '2099-12-31';

/** How many entries the listing asks for (Toshl's minimum page size); one is enough to refuse */
const GUARD_SAMPLE_SIZE = 10;

/**
 * Builds the GET /entries query that looks for entries carrying a tag or category.
 * @param filter `{ tags: id }` or `{ categories: id }`
 * @returns Query parameters
 */
export const guardEntryQuery = (
    filter: { tags: string } | { categories: string }
): Record<string, string | number> => ({
    ...filter,
    from: GUARD_FROM,
    to: GUARD_TO,
    per_page: GUARD_SAMPLE_SIZE,
});

/** Why the entry listing refused a delete, or that it may go ahead. */
export type ListedEntriesVerdict =
    | { allowed: true }
    | { allowed: false; reason: 'unknown-entries' }
    | { allowed: false; reason: 'has-listed-entries'; entries: { id: string; date: string }[] };

/**
 * Decides whether a delete may go ahead given the entries listed for the tag or category.
 *
 * Fails closed: anything other than an array is treated as "could not tell".
 *
 * @param entries Entries returned by the guard listing
 * @returns The verdict, naming up to GUARD_SAMPLE_SIZE entries when that is what blocked it
 */
export function evaluateListedEntries(entries: unknown): ListedEntriesVerdict {
    if (!Array.isArray(entries)) {
        return { allowed: false, reason: 'unknown-entries' };
    }

    if (entries.length === 0) {
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: 'has-listed-entries',
        entries: entries.slice(0, GUARD_SAMPLE_SIZE).map((entry) => ({
            id: String(entry?.id),
            date: String(entry?.date),
        })),
    };
}

/**
 * Formats the entries that blocked a delete as "id (date)" pairs.
 * @param entries Entries from a has-listed-entries verdict
 * @returns Comma-separated list
 */
export const describeListedEntries = (entries: { id: string; date: string }[]): string =>
    entries.map((entry) => `${entry.id} (${entry.date})`).join(', ');
