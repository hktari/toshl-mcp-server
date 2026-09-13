/**
 * Pagination helpers for Toshl list endpoints.
 *
 * Toshl paginates list responses and advertises neighbouring pages through an
 * RFC 8288 `Link` header, e.g.
 *   <https://api.toshl.com/entries?from=...&page=1&per_page=200>; rel="next"
 */

/**
 * Extracts the `page` number of the `rel="next"` link from a Link header.
 * @param linkHeader Raw Link header value (may be missing)
 * @returns The next page number, or null when there is no further page
 */
export const parseNextPage = (linkHeader: string | undefined): number | null => {
    if (!linkHeader) {
        return null;
    }

    for (const part of linkHeader.split(',')) {
        const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
        if (!match) {
            continue;
        }

        let pageParam: string | null;
        try {
            pageParam = new URL(match[1]).searchParams.get('page');
        } catch {
            return null;
        }

        const page = Number(pageParam);
        return pageParam !== null && Number.isInteger(page) && page >= 0 ? page : null;
    }

    return null;
};
