import { ToshlApiClient } from '../toshl-client.js';
import { ToshlPlanning } from '../../utils/types.js';
import { assertResourceId } from '../../utils/resource-id.js';
import logger from '../../utils/logger.js';

/**
 * Client for the Toshl Planning API
 */
export class PlanningClient {
    private client: ToshlApiClient;

    /**
     * Creates a new planning client
     * @param client The Toshl API client
     */
    constructor(client: ToshlApiClient) {
        this.client = client;
        logger.debug('Planning client initialized');
    }

    /**
     * Gets planning information
     * @param from Start date in YYYY-MM-DD format
     * @param to End date in YYYY-MM-DD format
     * @returns Planning information
     */
    async getPlanning(from: string = this.getDefaultFromDate(), to: string = this.getDefaultToDate()): Promise<ToshlPlanning> {
        logger.debug('Fetching planning information', { from, to });

        const params: Record<string, string> = {
            from,
            to
        };

        const response = await this.client.get<ToshlPlanning>('/planning', params);
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
     * Gets default from date (first day of current month)
     * @returns Date string in YYYY-MM-DD format
     */
    private getDefaultFromDate(): string {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }

    /**
     * Gets specific planning information by ID
     * @param id Planning ID
     * @param from Start date in YYYY-MM-DD format
     * @param to End date in YYYY-MM-DD format
     * @returns Planning details
     */
    async getPlanningById(id: string, from: string = this.getDefaultFromDate(), to: string = this.getDefaultToDate()): Promise<ToshlPlanning> {
        logger.debug('Fetching planning details', { id, from, to });

        const params: Record<string, string> = {
            from,
            to
        };

        const response = await this.client.get<ToshlPlanning>(`/planning/${assertResourceId(id)}`, params);
        return response.data;
    }
}

/**
 * Creates a planning client using the default Toshl API client
 * @param client Optional custom Toshl API client
 * @returns Planning client
 */
export async function createPlanningClient(client?: ToshlApiClient): Promise<PlanningClient> {
    // If no client is provided, import the default one
    if (!client) {
        // Using dynamic import to avoid circular dependency
        const { default: defaultClient } = await import('../toshl-client.js');
        return new PlanningClient(defaultClient);
    }

    return new PlanningClient(client);
}
