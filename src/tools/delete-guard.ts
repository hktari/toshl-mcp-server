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
