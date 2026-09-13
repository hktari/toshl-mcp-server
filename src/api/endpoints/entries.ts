import { ToshlApiClient } from '../toshl-client.js';
import { ToshlEntry, ToshlEntryPage, ToshlEntrySum, ToshlTimelineItem } from '../../utils/types.js';
import { parseNextPage } from '../../utils/pagination.js';
import logger from '../../utils/logger.js';

/**
 * Client for the Toshl Entries API
 */
export class EntriesClient {
    private client: ToshlApiClient;

    constructor(client: ToshlApiClient) {
        this.client = client;
        logger.debug('Entries client initialized');
    }

    /**
     * Gets a list of entries with optional filters
     */
    async listEntries(params?: Record<string, any>): Promise<ToshlEntry[]> {
        logger.debug('Fetching entries list', { params });
        const response = await this.client.get<ToshlEntry[]>('/entries', params);
        return response.data;
    }

    /**
     * Gets one page of entries together with the page that follows it, if any.
     * Toshl advertises the next page via the response's Link header.
     */
    async listEntriesPage(params: Record<string, any>): Promise<ToshlEntryPage> {
        logger.debug('Fetching entries page', { params });
        const response = await this.client.get<ToshlEntry[]>('/entries', params);
        return {
            entries: response.data,
            nextPage: parseNextPage(response.headers['link']),
        };
    }

    /**
     * Gets a specific entry by ID
     */
    async getEntry(id: string): Promise<ToshlEntry> {
        logger.debug('Fetching entry details', { id });
        const response = await this.client.get<ToshlEntry>(`/entries/${id}`);
        return response.data;
    }

    /**
     * Gets daily entry sums
     */
    async getEntrySums(params: Record<string, any>): Promise<ToshlEntrySum[]> {
        logger.debug('Fetching entry sums', { params });
        const response = await this.client.get<ToshlEntrySum[]>('/entries/sums', params);
        return response.data;
    }

    /**
     * Gets entries timeline
     */
    async getEntryTimeline(params: Record<string, any>): Promise<ToshlTimelineItem[]> {
        logger.debug('Fetching entry timeline', { params });
        const response = await this.client.get<ToshlTimelineItem[]>('/entries/timeline', params);
        return response.data;
    }

    /**
     * Creates a new entry
     * @param entry Entry data
     * @returns Created entry
     */
    async createEntry(entry: Partial<ToshlEntry>): Promise<ToshlEntry> {
        logger.debug('Creating entry', { entry });
        const response = await this.client.post<ToshlEntry>('/entries', entry);
        const id = response.headers['location'].split('/').pop();
        if (!id) {
            logger.debug('Response', response)
            throw new Error('Invalid response. Expected location header to contain entry ID');
        }
        return await this.getEntry(id);
    }

    /**
     * Updates an existing entry
     * @param id Entry ID
     * @param entry Entry data
     * @param updateMode Update mode (all, one, tail)
     * @returns Updated entry
     */
    async updateEntry(id: string, entry: Partial<ToshlEntry>, updateMode?: 'all' | 'one' | 'tail'): Promise<ToshlEntry> {
        logger.debug('Updating entry', { id, entry, updateMode });

        // First get the existing entry
        const existingEntry = await this.getEntry(id);

        // Merge the changes with the existing entry
        const updatedEntry = {
            ...existingEntry,
            ...entry
        };

        // Make sure all required fields are present
        if (!updatedEntry.amount || !updatedEntry.currency || !updatedEntry.date ||
            !updatedEntry.account || !updatedEntry.category || !updatedEntry.modified) {
            throw new Error('Missing required fields for updating entry');
        }

        const params: Record<string, any> = {};
        if (updateMode) {
            params.update = updateMode;
        }

        const response = await this.client.put<ToshlEntry>(`/entries/${id}`, updatedEntry, params);
        return response.data;
    }

    /**
     * Deletes an entry
     * @param id Entry ID
     * @param deleteMode Delete mode (all, one, tail)
     * @returns void
     */
    async deleteEntry(id: string, deleteMode?: 'all' | 'one' | 'tail'): Promise<void> {
        logger.debug('Deleting entry', { id, deleteMode });

        const params: Record<string, any> = {};
        if (deleteMode) {
            params.delete = deleteMode;
        }

        await this.client.delete<void>(`/entries/${id}`, params);
    }

    /**
     * Manages entries in bulk
     * @param params Management parameters
     * @returns void
     */
    async manageEntries(params: {
        with: {
            tags?: string[];
            accounts?: string[];
            categories?: string[];
            description?: string;
        };
        set?: {
            tags?: string[];
            account?: string;
            category?: string;
        };
        add?: {
            tags?: string[];
        };
        remove?: {
            tags?: string[];
        };
    }): Promise<void> {
        logger.debug('Managing entries', { params });

        // Validate required parameters
        if (!params.with) {
            throw new Error('Missing required parameter: with');
        }

        if (!params.with.tags && !params.with.accounts && !params.with.categories && !params.with.description) {
            throw new Error('At least one with parameter is required (tags, accounts, categories, or description)');
        }

        if (!params.set && !params.add && !params.remove) {
            throw new Error('At least one action parameter is required (set, add, or remove)');
        }

        await this.client.post<void>('/entries/manage', params);
    }
}

/**
 * Creates an entries client using the default Toshl API client
 */
export async function createEntriesClient(client?: ToshlApiClient): Promise<EntriesClient> {
    if (!client) {
        const { default: defaultClient } = await import('../toshl-client.js');
        return new EntriesClient(defaultClient);
    }
    return new EntriesClient(client);
}
