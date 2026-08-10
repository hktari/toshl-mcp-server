import { ToshlApiClient } from '../toshl-client.js';
import { ToshlCategory } from '../../utils/types.js';
import logger from '../../utils/logger.js';

/**
 * Client for the Toshl Categories API
 */
export class CategoriesClient {
    private client: ToshlApiClient;

    /**
     * Creates a new categories client
     * @param client The Toshl API client
     */
    constructor(client: ToshlApiClient) {
        this.client = client;
        logger.debug('Categories client initialized');
    }

    /**
     * Gets a list of all categories
     * @returns List of categories
     */
    async listCategories(): Promise<ToshlCategory[]> {
        logger.debug('Fetching categories list');

        const response = await this.client.get<ToshlCategory[]>('/categories');
        return response.data;
    }

    /**
     * Gets a specific category by ID
     * @param id Category ID
     * @returns Category details
     */
    async getCategory(id: string): Promise<ToshlCategory> {
        logger.debug('Fetching category details', { id });

        const response = await this.client.get<ToshlCategory>(`/categories/${id}`);
        return response.data;
    }

    /**
     * Creates a new category
     * @param category Category data (name and type)
     * @returns The created category
     */
    async createCategory(category: Partial<ToshlCategory>): Promise<ToshlCategory> {
        logger.debug('Creating category', { category });

        const response = await this.client.post<ToshlCategory>('/categories', category);
        const id = response.headers['location']?.split('/').pop();
        if (!id) {
            logger.debug('Response', response);
            throw new Error('Invalid response. Expected location header to contain category ID');
        }

        return await this.getCategory(id);
    }
}

/**
 * Creates a categories client using the default Toshl API client
 * @param client Optional custom Toshl API client
 * @returns Categories client
 */
export async function createCategoriesClient(client?: ToshlApiClient): Promise<CategoriesClient> {
    // If no client is provided, import the default one
    if (!client) {
        // Using dynamic import to avoid circular dependency
        const { default: defaultClient } = await import('../toshl-client.js');
        return new CategoriesClient(defaultClient);
    }

    return new CategoriesClient(client);
}
