import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { AuthProvider, createAuthProvider } from './auth.js';
import { ApiClientConfig, ApiResponse } from '../utils/types.js';
import { handleApiError } from '../utils/error-handler.js';
import cache, { requestCacheKey } from '../utils/cache.js';
import logger from '../utils/logger.js';
import { currentUser, isMultiUserMode } from '../server/request-context.js';

/** A cached response body and the Link header that came with it */
interface CachedResponse {
    data: unknown;
    link?: string;
}

/**
 * Cache keys carry the user they belong to. In multi-user mode two users asking for the
 * same URL must never share an ETag or a body; single-user mode keeps the old keys.
 * @param key Key from requestCacheKey
 * @param userId The request's user, when there is one
 */
function scopedKey(key: string, userId: string | undefined): string {
    return userId === undefined ? key : `user:${userId}:${key}`;
}

/**
 * Base client for Toshl API
 */
export class ToshlApiClient {
    private client: AxiosInstance;
    private authProvider: AuthProvider;
    private baseUrl: string;

    /**
     * Creates a new Toshl API client
     * @param config Client configuration
     * @param authProvider Authentication provider
     */
    constructor(config: ApiClientConfig, authProvider: AuthProvider) {
        this.baseUrl = config.baseUrl;
        this.authProvider = authProvider;

        this.client = axios.create({
            baseURL: config.baseUrl,
            timeout: config.timeout || 10000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor for authentication
        this.client.interceptors.request.use(
            async (config) => {
                // Multi-user mode: the signed-in user's own Toshl token, never the shared one.
                // A request outside a user context is a bug, so it fails instead of falling back.
                const user = currentUser();
                let authHeaders: Record<string, string>;
                if (user) {
                    authHeaders = { Authorization: await user.getAuthorization() };
                } else if (isMultiUserMode()) {
                    throw new Error('No signed-in user for this request');
                } else {
                    authHeaders = this.authProvider.getAuthHeaders();
                }
                // @ts-ignore TODO: check this
                config.headers = { ...config.headers, ...authHeaders };
                // Remembered on the request so the response side caches under the same user.
                (config as AxiosRequestConfig & { userId?: string }).userId = user?.userId;
                // Which credentials this request used, so a 401 can't remove newer ones.
                (config as AxiosRequestConfig & { usedAuthorization?: string }).usedAuthorization = user
                    ? authHeaders.Authorization
                    : undefined;

                // Add If-None-Match header if we have a cached ETag
                const cacheKey = scopedKey(requestCacheKey('etag', config.method, config.url, config.params), user?.userId);
                const etag = cache.get<string>(cacheKey);
                if (etag) {
                    config.headers['If-None-Match'] = etag;
                }

                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // Add response interceptor for caching
        this.client.interceptors.response.use(
            (response) => {
                // Cache ETag if present
                const etag = response.headers['etag'];
                const userId = (response.config as AxiosRequestConfig & { userId?: string }).userId;
                if (etag) {
                    const cacheKey = scopedKey(requestCacheKey('etag', response.config.method, response.config.url, response.config.params), userId);
                    cache.set(cacheKey, etag);

                    // Cache response data together with its Link header: Toshl leaves Link
                    // off a 304, and pagination reads the next page from it
                    const dataKey = scopedKey(requestCacheKey('data', response.config.method, response.config.url, response.config.params), userId);
                    cache.set<CachedResponse>(dataKey, { data: response.data, link: response.headers['link'] });
                }

                return response;
            },
            async (error) => {
                // Multi-user mode: Toshl refusing the user's own credentials means they were
                // revoked (a deleted personal token, a withdrawn grant). Forget them; the next
                // /mcp request gets the sign-in challenge.
                const user = currentUser();
                const used = (error.config as (AxiosRequestConfig & { usedAuthorization?: string }) | undefined)?.usedAuthorization;
                if (user && used && error.response?.status === 401) {
                    await user.revoke(used).catch(() => undefined);
                }

                // If 304 Not Modified, return cached data
                if (error.response && error.response.status === 304) {
                    const userId = (error.config as AxiosRequestConfig & { userId?: string }).userId;
                    const dataKey = scopedKey(requestCacheKey('data', error.config.method, error.config.url, error.config.params), userId);
                    const cached = cache.get<CachedResponse>(dataKey);

                    if (cached?.data) {
                        logger.debug('Using cached data (304 Not Modified)', { url: error.config.url });

                        const headers = { ...error.response.headers };
                        if (cached.link && !headers['link']) {
                            headers['link'] = cached.link;
                        }

                        // Create a successful response with cached data
                        return {
                            ...error.response,
                            status: 200,
                            data: cached.data,
                            headers,
                            fromCache: true
                        };
                    }
                }

                return Promise.reject(error);
            }
        );

        logger.debug('Toshl API client initialized', { baseUrl: config.baseUrl });
    }

    /**
     * Makes a GET request to the Toshl API
     * @param path API path
     * @param params Query parameters
     * @param config Additional Axios config
     * @returns API response
     */
    async get<T>(path: string, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        try {
            const response: AxiosResponse = await this.client.get(path, {
                ...config,
                params
            });

            return {
                data: response.data,
                status: response.status,
                headers: response.headers as Record<string, string>
            };
        } catch (error) {
            handleApiError(error);
            // This line will never be reached due to handleApiError throwing an error
            throw error;
        }
    }

    /**
     * Makes a POST request to the Toshl API
     * @param path API path
     * @param data Request body
     * @param params Query parameters
     * @param config Additional Axios config
     * @returns API response
     */
    async post<T>(path: string, data: any, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        try {
            const response: AxiosResponse = await this.client.post(path, data, {
                ...config,
                params
            });

            return {
                data: response.data,
                status: response.status,
                headers: response.headers as Record<string, string>
            };
        } catch (error) {
            handleApiError(error);
            // This line will never be reached due to handleApiError throwing an error
            throw error;
        }
    }

    /**
     * Makes a PUT request to the Toshl API
     * @param path API path
     * @param data Request body
     * @param params Query parameters
     * @param config Additional Axios config
     * @returns API response
     */
    async put<T>(path: string, data: any, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        try {
            const response: AxiosResponse = await this.client.put(path, data, {
                ...config,
                params
            });

            return {
                data: response.data,
                status: response.status,
                headers: response.headers as Record<string, string>
            };
        } catch (error) {
            handleApiError(error);
            // This line will never be reached due to handleApiError throwing an error
            throw error;
        }
    }

    /**
     * Makes a DELETE request to the Toshl API
     * @param path API path
     * @param params Query parameters
     * @param config Additional Axios config
     * @returns API response
     */
    async delete<T>(path: string, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        try {
            const response: AxiosResponse = await this.client.delete(path, {
                ...config,
                params
            });

            return {
                data: response.data,
                status: response.status,
                headers: response.headers as Record<string, string>
            };
        } catch (error) {
            handleApiError(error);
            // This line will never be reached due to handleApiError throwing an error
            throw error;
        }
    }

    /**
     * Checks if the client is properly authenticated
     * @returns true if authenticated
     */
    isAuthenticated(): boolean {
        return currentUser() !== undefined || this.authProvider.isConfigured();
    }

    /**
     * Gets the base URL of the API
     * @returns Base URL
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
}

/**
 * Creates a Toshl API client from environment variables
 * @returns Configured Toshl API client
 */
export function createToshlApiClient(): ToshlApiClient {
    const baseUrl = process.env.TOSHL_API_BASE_URL || 'https://api.toshl.com';

    const config: ApiClientConfig = {
        baseUrl,
        token: process.env.TOSHL_API_TOKEN || '',
        timeout: parseInt(process.env.API_TIMEOUT || '10000', 10)
    };

    const authProvider = createAuthProvider();

    return new ToshlApiClient(config, authProvider);
}

// Create a default client instance
const toshlApiClient = createToshlApiClient();

export default toshlApiClient;
