import { ToshlApiClient } from '../toshl-client.js';
import { ToshlBudget } from '../../utils/types.js';
import { assertResourceId } from '../../utils/resource-id.js';
import logger from '../../utils/logger.js';

/**
 * Client for the Toshl Budgets API
 */
export class BudgetsClient {
    private client: ToshlApiClient;

    /**
     * Creates a new budgets client
     * @param client The Toshl API client
     */
    constructor(client: ToshlApiClient) {
        this.client = client;
        logger.debug('Budgets client initialized');
    }

    /**
     * Gets a list of all budgets
     * @param from Start date in YYYY-MM-DD format (optional)
     * @param to End date in YYYY-MM-DD format (optional)
     * @returns List of budgets
     */
    async listBudgets(from?: string, to: string = this.getDefaultToDate()): Promise<ToshlBudget[]> {
        logger.debug('Fetching budgets list', { from, to });

        const params: Record<string, string> = { to };
        if (from) {
            params.from = from;
        }

        const response = await this.client.get<ToshlBudget[]>('/budgets', params);
        return response.data;
    }

    /**
     * Gets default to date (last day of current month)
     * @returns Date string in YYYY-MM-DD format
     */
    private getDefaultToDate(): string {
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        // Get the last day of the current month
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    /**
     * Gets a specific budget by ID
     * @param id Budget ID
     * @param from Start date in YYYY-MM-DD format (optional)
     * @param to End date in YYYY-MM-DD format (optional)
     * @returns Budget details
     */
    async getBudget(id: string, from?: string, to: string = this.getDefaultToDate()): Promise<ToshlBudget> {
        logger.debug('Fetching budget details', { id, from, to });

        const params: Record<string, string> = { to };
        if (from) {
            params.from = from;
        }

        const response = await this.client.get<ToshlBudget>(`/budgets/${assertResourceId(id)}`, params);
        return response.data;
    }

    /**
     * Gets the history of a specific budget
     * @param id Budget ID
     * @param from Start date in YYYY-MM-DD format (optional)
     * @param to End date in YYYY-MM-DD format (optional)
     * @returns Budget history
     */
    async getBudgetHistory(id: string, from?: string, to: string = this.getDefaultToDate()): Promise<any[]> {
        logger.debug('Fetching budget history', { id, from, to });

        const params: Record<string, string> = { to };
        if (from) {
            params.from = from;
        }

        const response = await this.client.get<any[]>(`/budgets/${assertResourceId(id)}/history`, params);
        return response.data;
    }
}

/**
 * Creates a budgets client using the default Toshl API client
 * @param client Optional custom Toshl API client
 * @returns Budgets client
 */
export async function createBudgetsClient(client?: ToshlApiClient): Promise<BudgetsClient> {
    // If no client is provided, import the default one
    if (!client) {
        // Using dynamic import to avoid circular dependency
        const { default: defaultClient } = await import('../toshl-client.js');
        return new BudgetsClient(defaultClient);
    }

    return new BudgetsClient(client);
}
