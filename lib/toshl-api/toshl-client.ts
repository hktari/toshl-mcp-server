import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import {
  Account,
  Entry,
  Budget,
  Category,
  Tag,
  Currency,
  Export,
  Me,
  RateLimitStatus as APIRateLimitStatus,
} from "./toshl-api-response-types.js";

export interface PaginationInfo {
  first?: string;
  previous?: string;
  next?: string;
  last?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
  headers: {
    "X-RateLimit-Limit": number;
    "X-RateLimit-Remaining": number;
    Link: string;
  };
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
}

export interface ToshlClientConfig {
  token: string;
  baseURL?: string;
  timeout?: number;
  defaultPerPage?: number;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
}

export class ToshlClient {
  private client: AxiosInstance;
  private rateLimitStatus: RateLimitStatus = { limit: 1000, remaining: 1000 };

  constructor(config: ToshlClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL || "https://api.toshl.com",
      timeout: config.timeout || 10000,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.toshl+json,application/json",
      },
    });

    // Add response interceptor to track rate limiting
    this.client.interceptors.response.use(
      (response) => {
        this.updateRateLimitStatus(response);
        return response;
      },
      (error) => {
        if (error.response) {
          this.updateRateLimitStatus(error.response);
        }
        return Promise.reject(error);
      }
    );
  }

  private updateRateLimitStatus(response: AxiosResponse) {
    const limit = response.headers["x-ratelimit-limit"];
    const remaining = response.headers["x-ratelimit-remaining"];

    if (limit && remaining) {
      this.rateLimitStatus = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
      };
    }
  }

  private parseLinkHeader(linkHeader: string): PaginationInfo {
    const pagination: PaginationInfo = {};

    if (!linkHeader) return pagination;

    const links = linkHeader.split(",");
    links.forEach((link) => {
      const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match) {
        const [, url, rel] = match;
        pagination[rel as keyof PaginationInfo] = url;
      }
    });

    return pagination;
  }

  public async request<T>(
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    try {
      return await this.client.request<T>(config);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw this.handleError(error);
      }
      throw error;
    }
  }

  private handleError(error: AxiosError): Error {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 400:
          return new ToshlValidationError(
            data?.description || "Bad Request",
            data?.field_errors
          );
        case 401:
          return new ToshlAuthError("Authentication failed");
        case 403:
          return new ToshlPermissionError("Permission denied");
        case 404:
          return new ToshlNotFoundError("Resource not found");
        case 409:
          return new ToshlConflictError("Conflict detected", data);
        case 429:
          return new ToshlRateLimitError("Rate limit exceeded");
        default:
          return new ToshlAPIError(`API Error: ${status}`, status, data);
      }
    } else if (error.request) {
      return new ToshlNetworkError("Network error");
    }
    return new ToshlAPIError("Unknown error");
  }

  // Rate limiting methods
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    try {
      const response = await this.client.get<APIRateLimitStatus>("/rate-limit");
      this.rateLimitStatus = response.data;
      return response.data;
    } catch (error) {
      return this.rateLimitStatus; // Return cached status on error
    }
  }

  getCurrentRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  isRateLimitExceeded(): boolean {
    return this.rateLimitStatus.remaining <= 0;
  }

  // User information
  async getMe(): Promise<Me> {
    const response = await this.request<Me>({ method: "GET", url: "/me" });
    return response.data;
  }

  // Generic list method with pagination
  private async listResource<T>(
    endpoint: string,
    params: {
      page?: number;
      per_page?: number;
      from?: string;
      to?: string;
      [key: string]: any;
    } = {}
  ): Promise<PaginatedResponse<T>> {
    const response = await this.request<T[]>({
      method: "GET",
      url: endpoint,
      params,
    });

    return {
      data: response.data,
      pagination: this.parseLinkHeader(response.headers["link"]),
      headers: {
        "X-RateLimit-Limit": parseInt(
          response.headers["x-ratelimit-limit"] || "0",
          10
        ),
        "X-RateLimit-Remaining": parseInt(
          response.headers["x-ratelimit-remaining"] || "0",
          10
        ),
        Link: response.headers["link"] || "",
      },
    };
  }

  // API Methods will be added here
  // Accounts
  async getAccounts(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Account>> {
    return this.listResource<Account>("/accounts");
  }

  async getAccount(id: string): Promise<Account> {
    const response = await this.request<Account>({
      method: "GET",
      url: `/accounts/${id}`,
    });
    return response.data;
  }

  async createAccount(data: Partial<Account>): Promise<Account> {
    const response = await this.request<Account>({
      method: "POST",
      url: "/accounts",
      data,
    });
    return response.data;
  }

  async updateAccount(id: string, data: Partial<Account>): Promise<Account> {
    const response = await this.request<Account>({
      method: "PUT",
      url: `/accounts/${id}`,
      data,
    });
    return response.data;
  }

  async deleteAccount(id: string): Promise<void> {
    await this.request({ method: "DELETE", url: `/accounts/${id}` });
  }

  // Entries
  async getEntries(params?: {
    page?: number;
    per_page?: number;
    from?: string;
    to?: string;
    account?: string;
    category?: string;
    tags?: string;
  }): Promise<PaginatedResponse<Entry>> {
    return this.listResource<Entry>("/entries", params);
  }

  async getEntry(id: string): Promise<Entry> {
    const response = await this.request<Entry>({
      method: "GET",
      url: `/entries/${id}`,
    });
    return response.data;
  }

  async createEntry(data: Partial<Entry>): Promise<Entry> {
    const response = await this.request<Entry>({
      method: "POST",
      url: "/entries",
      data,
    });
    return response.data;
  }

  async updateEntry(id: string, data: Partial<Entry>): Promise<Entry> {
    const response = await this.request<Entry>({
      method: "PUT",
      url: `/entries/${id}`,
      data,
    });
    return response.data;
  }

  async deleteEntry(id: string): Promise<void> {
    await this.request({ method: "DELETE", url: `/entries/${id}` });
  }

  // Budgets
  async getBudgets(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Budget>> {
    return this.listResource<Budget>("/budgets", params);
  }

  async getBudget(id: string): Promise<Budget> {
    const response = await this.request<Budget>({
      method: "GET",
      url: `/budgets/${id}`,
    });
    return response.data;
  }

  async createBudget(data: Partial<Budget>): Promise<Budget> {
    const response = await this.request<Budget>({
      method: "POST",
      url: "/budgets",
      data,
    });
    return response.data;
  }

  async updateBudget(id: string, data: Partial<Budget>): Promise<Budget> {
    const response = await this.request<Budget>({
      method: "PUT",
      url: `/budgets/${id}`,
      data,
    });
    return response.data;
  }

  async deleteBudget(id: string): Promise<void> {
    await this.request({ method: "DELETE", url: `/budgets/${id}` });
  }

  // Categories
  async getCategories(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Category>> {
    return this.listResource<Category>("/categories", params);
  }

  async getCategory(id: string): Promise<Category> {
    const response = await this.request<Category>({
      method: "GET",
      url: `/categories/${id}`,
    });
    return response.data;
  }

  async createCategory(data: Partial<Category>): Promise<Category> {
    const response = await this.request<Category>({
      method: "POST",
      url: "/categories",
      data,
    });
    return response.data;
  }

  async updateCategory(id: string, data: Partial<Category>): Promise<Category> {
    const response = await this.request<Category>({
      method: "PUT",
      url: `/categories/${id}`,
      data,
    });
    return response.data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request({ method: "DELETE", url: `/categories/${id}` });
  }

  // Tags
  async getTags(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Tag>> {
    return this.listResource<Tag>("/tags", params);
  }

  async getTag(id: string): Promise<Tag> {
    const response = await this.request<Tag>({
      method: "GET",
      url: `/tags/${id}`,
    });
    return response.data;
  }

  async createTag(data: Partial<Tag>): Promise<Tag> {
    const response = await this.request<Tag>({
      method: "POST",
      url: "/tags",
      data,
    });
    return response.data;
  }

  async updateTag(id: string, data: Partial<Tag>): Promise<Tag> {
    const response = await this.request<Tag>({
      method: "PUT",
      url: `/tags/${id}`,
      data,
    });
    return response.data;
  }

  async deleteTag(id: string): Promise<void> {
    await this.request({ method: "DELETE", url: `/tags/${id}` });
  }

  // Currencies
  async getCurrencies(params?: {
    currencies?: string;
    since?: string;
    types?: string;
  }): Promise<Currency[]> {
    const response = await this.request<Currency[]>({
      method: "GET",
      url: "/currencies",
      params,
    });
    return response.data;
  }

  // Exports
  async getExports(params?: {
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<Export>> {
    return this.listResource<Export>("/exports", params);
  }

  async createExport(data: Partial<Export>): Promise<Export> {
    const response = await this.request<Export>({
      method: "POST",
      url: "/exports",
      data,
    });
    return response.data;
  }

  async getExport(id: string): Promise<Export> {
    const response = await this.request<Export>({
      method: "GET",
      url: `/exports/${id}`,
    });
    return response.data;
  }
}

// Custom Error Classes
export class ToshlAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any
  ) {
    super(message);
    this.name = "ToshlAPIError";
  }
}

export class ToshlValidationError extends ToshlAPIError {
  constructor(
    message: string,
    public fieldErrors?: any[]
  ) {
    super(message, 400);
    this.name = "ToshlValidationError";
  }
}

export class ToshlAuthError extends ToshlAPIError {
  constructor(message: string) {
    super(message, 401);
    this.name = "ToshlAuthError";
  }
}

export class ToshlPermissionError extends ToshlAPIError {
  constructor(message: string) {
    super(message, 403);
    this.name = "ToshlPermissionError";
  }
}

export class ToshlNotFoundError extends ToshlAPIError {
  constructor(message: string) {
    super(message, 404);
    this.name = "ToshlNotFoundError";
  }
}

export class ToshlConflictError extends ToshlAPIError {
  constructor(
    message: string,
    public conflictData?: any
  ) {
    super(message, 409);
    this.name = "ToshlConflictError";
  }
}

export class ToshlRateLimitError extends ToshlAPIError {
  constructor(message: string) {
    super(message, 429);
    this.name = "ToshlRateLimitError";
  }
}

export class ToshlNetworkError extends ToshlAPIError {
  constructor(message: string) {
    super(message);
    this.name = "ToshlNetworkError";
  }
}
