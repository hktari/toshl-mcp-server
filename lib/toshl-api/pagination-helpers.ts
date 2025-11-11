import { ToshlClient, PaginatedResponse } from "./toshl-client.js";

export class PaginationHelper<T> {
  private client: ToshlClient;
  private endpoint: string;
  private params: Record<string, any>;
  private currentPage: number = 0;
  private lastPage?: number;

  constructor(
    client: ToshlClient,
    endpoint: string,
    params: Record<string, any> = {}
  ) {
    this.client = client;
    this.endpoint = endpoint;
    this.params = params;
  }

  async getCurrentPage(): Promise<PaginatedResponse<T>> {
    const response = await this.client.request<T[]>({
      method: "GET",
      url: this.endpoint,
      params: { ...this.params, page: this.currentPage },
    });

    // Update pagination info
    if (response.headers["link"]) {
      const pagination = this.parseLinkHeader(response.headers["link"]);
      if (pagination.last) {
        const lastPageMatch = pagination.last.match(/page=(\d+)/);
        if (lastPageMatch) {
          this.lastPage = parseInt(lastPageMatch[1], 10);
        }
      }
    }

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

  async getNextPage(): Promise<PaginatedResponse<T> | null> {
    if (this.lastPage !== undefined && this.currentPage >= this.lastPage) {
      return null;
    }

    this.currentPage++;
    return this.getCurrentPage();
  }

  async getPreviousPage(): Promise<PaginatedResponse<T> | null> {
    if (this.currentPage <= 0) {
      return null;
    }

    this.currentPage--;
    return this.getCurrentPage();
  }

  async getFirstPage(): Promise<PaginatedResponse<T>> {
    this.currentPage = 0;
    return this.getCurrentPage();
  }

  async getLastPage(): Promise<PaginatedResponse<T>> {
    if (this.lastPage === undefined) {
      // We need to fetch the first page to get the last page info
      await this.getFirstPage();
    }

    if (this.lastPage !== undefined) {
      this.currentPage = this.lastPage;
      return this.getCurrentPage();
    }

    throw new Error("Unable to determine last page");
  }

  async goToPage(pageNumber: number): Promise<PaginatedResponse<T>> {
    this.currentPage = pageNumber;
    return this.getCurrentPage();
  }

  async getAllPages(): Promise<T[]> {
    const allItems: T[] = [];
    let currentPage = await this.getFirstPage();

    allItems.push(...currentPage.data);

    while (currentPage.pagination.next) {
      const nextPage = await this.getNextPage();
      if (!nextPage) break;
      allItems.push(...nextPage.data);
      currentPage = nextPage;
    }

    return allItems;
  }

  async *iteratePages(): AsyncGenerator<PaginatedResponse<T>, void, unknown> {
    let currentPage = await this.getFirstPage();
    yield currentPage;

    while (currentPage.pagination.next) {
      const nextPage = await this.getNextPage();
      if (!nextPage) break;
      currentPage = nextPage;
      yield currentPage;
    }
  }

  async *iterateItems(): AsyncGenerator<T, void, unknown> {
    for await (const page of this.iteratePages()) {
      for (const item of page.data) {
        yield item;
      }
    }
  }

  getCurrentPageNumber(): number {
    return this.currentPage;
  }

  getLastPageNumber(): number | undefined {
    return this.lastPage;
  }

  hasNextPage(): boolean {
    if (this.lastPage === undefined) return true;
    return this.currentPage < this.lastPage;
  }

  hasPreviousPage(): boolean {
    return this.currentPage > 0;
  }

  private parseLinkHeader(linkHeader: string): any {
    const pagination: any = {};

    if (!linkHeader) return pagination;

    const links = linkHeader.split(",");
    links.forEach((link) => {
      const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match) {
        const [, url, rel] = match;
        pagination[rel] = url;
      }
    });

    return pagination;
  }
}

// Utility functions for common pagination patterns
export async function fetchAllPages<T>(
  client: ToshlClient,
  endpoint: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const helper = new PaginationHelper<T>(client, endpoint, params);
  return helper.getAllPages();
}

export async function fetchPageRange<T>(
  client: ToshlClient,
  endpoint: string,
  startPage: number,
  endPage: number,
  params: Record<string, any> = {}
): Promise<T[]> {
  const allItems: T[] = [];
  const helper = new PaginationHelper<T>(client, endpoint, params);

  for (let page = startPage; page <= endPage; page++) {
    const response = await helper.goToPage(page);
    allItems.push(...response.data);

    // Break if we've reached the last page
    if (!helper.hasNextPage()) break;
  }

  return allItems;
}

export async function searchWithPagination<T>(
  client: ToshlClient,
  endpoint: string,
  searchParams: Record<string, any>,
  maxPages: number = 10
): Promise<T[]> {
  const helper = new PaginationHelper<T>(client, endpoint, searchParams);
  const allItems: T[] = [];
  let pagesFetched = 0;

  for await (const page of helper.iteratePages()) {
    allItems.push(...page.data);
    pagesFetched++;

    if (pagesFetched >= maxPages) break;
  }

  return allItems;
}
