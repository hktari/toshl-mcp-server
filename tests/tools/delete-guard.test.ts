import { readEntryCount, evaluateDelete } from '../../src/tools/delete-guard.js';

// These tests exist for one reason: the entry-count guard is the only thing standing
// between `category_delete` / `tag_delete` and bookkeeping the user cannot get back.
// A guard that silently passes is worse than no guard, because the tool description
// promises it is there. So the cases that matter most here are the ones where the
// count is missing or malformed.

describe('readEntryCount', () => {
    it('reads counts.entries, the shape the category and tag schemas require', () => {
        expect(readEntryCount({ counts: { entries: 21 } })).toBe(21);
    });

    it('reads a flat count, the shape the GET /tags/:id example response shows', () => {
        expect(readEntryCount({ count: 5 })).toBe(5);
    });

    it('prefers counts.entries when a payload carries both', () => {
        expect(readEntryCount({ counts: { entries: 21 }, count: 5 })).toBe(21);
    });

    it('reads zero as zero rather than as missing', () => {
        expect(readEntryCount({ counts: { entries: 0 } })).toBe(0);
    });

    it.each([
        ['no count field at all', {}],
        ['an empty counts object', { counts: {} }],
        ['a null payload', null],
        ['an undefined payload', undefined],
        ['a string count', { counts: { entries: '21' } }],
        ['a null count', { counts: { entries: null } }],
        ['NaN', { counts: { entries: NaN } }],
        ['Infinity', { counts: { entries: Infinity } }],
        ['a negative count', { counts: { entries: -1 } }],
        ['a fractional count', { counts: { entries: 1.5 } }],
    ])('reports undefined for %s', (_label, payload) => {
        expect(readEntryCount(payload as never)).toBeUndefined();
    });
});

describe('evaluateDelete', () => {
    it('allows deleting something with no entries', () => {
        expect(evaluateDelete(0, false)).toEqual({ allowed: true });
    });

    it('refuses when entries would be affected', () => {
        expect(evaluateDelete(21, false)).toEqual({
            allowed: false,
            reason: 'has-entries',
            entryCount: 21,
        });
    });

    // The regression this whole module exists for: an unreadable count used to be
    // coalesced to 0 with `?? 0`, which let the guard wave through exactly the
    // deletions it was written to stop.
    it('fails closed when the count could not be determined', () => {
        expect(evaluateDelete(undefined, false)).toEqual({
            allowed: false,
            reason: 'unknown-count',
        });
    });

    it('treats an absent force flag as not forced', () => {
        expect(evaluateDelete(undefined)).toEqual({
            allowed: false,
            reason: 'unknown-count',
        });
        expect(evaluateDelete(21)).toEqual({
            allowed: false,
            reason: 'has-entries',
            entryCount: 21,
        });
    });

    it('lets force override both refusals, since that is what force is for', () => {
        expect(evaluateDelete(21, true)).toEqual({ allowed: true });
        expect(evaluateDelete(undefined, true)).toEqual({ allowed: true });
    });
});
