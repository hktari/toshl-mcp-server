import { ToshlApiClient } from '../toshl-client.js';
import { readBackCreated } from '../../utils/created-resource.js';
import { ToshlTag, ToshlTagPage } from '../../utils/types.js';
import { parseNextPage } from '../../utils/pagination.js';
import { assertResourceId } from '../../utils/resource-id.js';
import logger from '../../utils/logger.js';

/** Page size used when fetching every tag (Toshl's documented maximum) */
const TAG_LIST_ALL_PER_PAGE = 500;

/** Pages listAllTags fetches before it gives up rather than return a partial list */
const TAG_LIST_MAX_PAGES = 20;

/**
 * Client for the Toshl Tags API
 */
export class TagsClient {
    private client: ToshlApiClient;

    /**
     * Creates a new tags client
     * @param client The Toshl API client
     */
    constructor(client: ToshlApiClient) {
        this.client = client;
        logger.debug('Tags client initialized');
    }

    /**
     * Gets one page of tags together with the page that follows it, if any.
     * Toshl advertises the next page via the response's Link header.
     * @param params Query parameters (page, per_page and filters)
     * @returns The page of tags and the next page number, or null on the last page
     */
    async listTagsPage(params: Record<string, any>): Promise<ToshlTagPage> {
        logger.debug('Fetching tags page', { params });

        const response = await this.client.get<ToshlTag[]>('/tags', params);
        return {
            tags: response.data,
            nextPage: parseNextPage(response.headers['link']),
        };
    }

    /**
     * Gets every tag by following the Link header page by page.
     *
     * Fails closed: if pages still remain after maxPages, it throws rather than
     * return a list that silently leaves tags out.
     *
     * @param maxPages Maximum number of pages to fetch
     * @returns All tags
     */
    async listAllTags(maxPages = TAG_LIST_MAX_PAGES): Promise<ToshlTag[]> {
        const tags: ToshlTag[] = [];
        let page: number | null = 0;

        for (let fetched = 0; fetched < maxPages && page !== null; fetched++) {
            const result: ToshlTagPage = await this.listTagsPage({ page, per_page: TAG_LIST_ALL_PER_PAGE });
            tags.push(...result.tags);
            page = result.nextPage;
        }

        if (page !== null) {
            throw new Error(
                `Tag list has more than ${maxPages} pages of ${TAG_LIST_ALL_PER_PAGE}; refusing to return a partial list`
            );
        }

        return tags;
    }

    /**
     * Gets a specific tag by ID
     * @param id Tag ID
     * @returns Tag details
     */
    async getTag(id: string): Promise<ToshlTag> {
        logger.debug('Fetching tag details', { id });

        const response = await this.client.get<ToshlTag>(`/tags/${assertResourceId(id)}`);
        return response.data;
    }

    /**
     * Updates an existing tag
     * @param id Tag ID
     * @param changes Fields to update (name, type and/or category)
     * @returns The updated tag
     */
    async updateTag(id: string, changes: Partial<ToshlTag>): Promise<ToshlTag> {
        logger.debug('Updating tag', { id, changes });

        // Fetch the existing tag first so the PUT carries the current
        // modified timestamp (Toshl uses it for optimistic concurrency)
        const existing = await this.getTag(id);
        const updated = {
            ...existing,
            ...changes
        };

        const response = await this.client.put<ToshlTag>(`/tags/${assertResourceId(id)}`, updated);
        return response.data;
    }

    /**
     * Creates a new tag
     * @param tag Tag data (name, type and optional category)
     * @returns The created tag
     */
    async createTag(tag: Partial<ToshlTag>): Promise<ToshlTag> {
        logger.debug('Creating tag', { tag });

        const response = await this.client.post<ToshlTag>('/tags', tag);
        const id = response.headers['location']?.split('/').pop();
        if (!id) {
            logger.debug('Response', { status: response.status });
            throw new Error('Invalid response. Expected location header to contain tag ID');
        }

        return await readBackCreated('tag', id, () => this.getTag(id));
    }

    /**
     * Deletes a tag
     *
     * The id is encoded before it reaches the path. The rest of this file interpolates
     * ids raw, which is a repo-wide gap worth closing separately — but on a DELETE the
     * consequence of an id that carries path segments changes from reading the wrong
     * resource to destroying one, so this call site does not wait for that cleanup.
     *
     * @param id Tag ID
     * @returns void
     */
    async deleteTag(id: string): Promise<void> {
        logger.debug('Deleting tag', { id });

        await this.client.delete<void>(`/tags/${assertResourceId(id)}`);
    }
}

/**
 * Creates a tags client using the default Toshl API client
 * @param client Optional custom Toshl API client
 * @returns Tags client
 */
export async function createTagsClient(client?: ToshlApiClient): Promise<TagsClient> {
    // If no client is provided, import the default one
    if (!client) {
        // Using dynamic import to avoid circular dependency
        const { default: defaultClient } = await import('../toshl-client.js');
        return new TagsClient(defaultClient);
    }

    return new TagsClient(client);
}
