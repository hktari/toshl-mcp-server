import { parseNextPage } from '../../src/utils/pagination.js';

describe('parseNextPage', () => {
    test('returns the page number from the rel="next" link', () => {
        const link = '<https://api.toshl.com/entries?from=2024-01-01&to=2024-01-31&page=1&per_page=200>; rel="next"';
        expect(parseNextPage(link)).toBe(1);
    });

    test('ignores other rels and picks next out of a multi-link header', () => {
        const link = '<https://api.toshl.com/entries?page=0>; rel="prev", '
            + '<https://api.toshl.com/entries?page=2>; rel="next", '
            + '<https://api.toshl.com/entries?page=7>; rel="last"';
        expect(parseNextPage(link)).toBe(2);
    });

    test('returns null when there is no next link', () => {
        const link = '<https://api.toshl.com/entries?page=1>; rel="prev"';
        expect(parseNextPage(link)).toBeNull();
    });

    test('returns null for a missing or empty header', () => {
        expect(parseNextPage(undefined)).toBeNull();
        expect(parseNextPage('')).toBeNull();
    });

    test('returns null when the next link carries no usable page param', () => {
        expect(parseNextPage('<https://api.toshl.com/entries>; rel="next"')).toBeNull();
        expect(parseNextPage('<not a url>; rel="next"')).toBeNull();
    });
});
