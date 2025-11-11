import {
  ToshlClient,
  ToshlValidationError,
  ToshlRateLimitError,
} from "../toshl-client.js";
import { PaginationHelper, fetchAllPages } from "../pagination-helpers.js";
import {
  Entry,
  Account,
  Budget,
  Category,
  Tag,
  Export,
} from "../toshl-api-response-types.js";

// Initialize the client
const client = new ToshlClient({
  token: process.env.TOSHL_API_TOKEN || "your-token-here",
  baseURL: "https://api.toshl.com",
  timeout: 10000,
  defaultPerPage: 200,
});

// Basic Usage Examples
async function basicExamples() {
  try {
    // Check rate limit status
    const rateLimit = await client.getRateLimitStatus();
    console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);

    // Get all accounts
    const accounts = await client.getAccounts();
    console.log("Accounts:", accounts.data);

    // Get a specific account
    if (accounts.data.length > 0) {
      const account = await client.getAccount(accounts.data[0].id);
      console.log("First account:", account);
    }

    // Create a new account
    const newAccount = await client.createAccount({
      name: "Test Account",
      type: "depository",
      balance: 1000,
    });
    console.log("Created account:", newAccount);

    // Get entries with date range
    const entries = await client.getEntries({
      from: "2025-01-01",
      to: "2025-01-31",
      per_page: 50,
    });
    console.log("Entries:", entries.data.length);

    // Create a new entry
    const newEntry = await client.createEntry({
      amount: -25.5,
      currency: { code: "USD" },
      date: "2025-01-15",
      desc: "Coffee shop",
      account: newAccount.id,
      category: "food",
    });
    console.log("Created entry:", newEntry);
  } catch (error) {
    if (error instanceof ToshlValidationError) {
      console.error("Validation error:", error.message);
      console.error("Field errors:", error.fieldErrors);
    } else if (error instanceof ToshlRateLimitError) {
      console.error(
        "Rate limit exceeded. Please wait before making more requests."
      );
    } else {
      console.error("Error:", error);
    }
  }
}

// Pagination Examples
async function paginationExamples() {
  try {
    // Method 1: Using the built-in paginated response
    const firstPage = await client.getEntries({ per_page: 100 });
    console.log(`First page has ${firstPage.data.length} entries`);
    console.log("Pagination info:", firstPage.pagination);

    // Method 2: Using PaginationHelper for more control
    const helper = new PaginationHelper<Entry>(client, "/entries", {
      from: "2025-01-01",
      to: "2025-12-31",
    });

    // Get all pages automatically
    const allEntries = await helper.getAllPages();
    console.log(`Total entries fetched: ${allEntries.length}`);

    // Iterate through pages manually
    for await (const page of helper.iteratePages()) {
      console.log(
        `Page ${helper.getCurrentPageNumber()}: ${page.data.length} entries`
      );
      console.log(
        `Rate limit remaining: ${page.headers["X-RateLimit-Remaining"]}`
      );

      // Stop if we're running low on rate limit
      if (page.headers["X-RateLimit-Remaining"] < 10) {
        console.log("Rate limit running low, stopping pagination");
        break;
      }
    }

    // Method 3: Using utility functions
    const allBudgets = await fetchAllPages<Budget>(client, "/budgets");
    console.log(`Total budgets: ${allBudgets.length}`);
  } catch (error) {
    console.error("Pagination error:", error);
  }
}

// Advanced Usage Examples
async function advancedExamples() {
  try {
    // Monitor rate limits during bulk operations
    const rateLimit = client.getCurrentRateLimitStatus();
    console.log("Starting with rate limit:", rateLimit);

    // Fetch entries in batches to respect rate limits
    const allEntries: Entry[] = [];
    let page = 0;
    const maxPages = 5; // Limit to avoid hitting rate limits

    while (page < maxPages) {
      const currentRateLimit = client.getCurrentRateLimitStatus();

      // Stop if we're running low on requests
      if (currentRateLimit.remaining < 5) {
        console.log("Rate limit too low, stopping");
        break;
      }

      const response = await client.getEntries({ page, per_page: 200 });
      allEntries.push(...response.data);

      console.log(`Fetched page ${page}: ${response.data.length} entries`);
      console.log(
        `Rate limit remaining: ${response.headers["X-RateLimit-Remaining"]}`
      );

      page++;

      // Add a small delay to be respectful to the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`Total entries fetched: ${allEntries.length}`);

    // Handle conflicts gracefully
    try {
      const entry = await client.getEntry("some-entry-id");
      // Try to update the entry
      await client.updateEntry("some-entry-id", {
        desc: "Updated description",
        amount: entry.amount,
      });
    } catch (error: any) {
      if (error.name === "ToshlConflictError") {
        console.log("Conflict detected, fetching fresh data");
        const freshEntry = await client.getEntry("some-entry-id");
        console.log("Fresh data:", freshEntry);

        // Now retry with fresh data
        await client.updateEntry("some-entry-id", {
          desc: "Updated description",
          amount: freshEntry.amount,
        });
      }
    }
  } catch (error) {
    console.error("Advanced example error:", error);
  }
}

// Search and Filter Examples
async function searchExamples() {
  try {
    // Search entries by account and date range
    const accountEntries = await client.getEntries({
      account: "account-id-here",
      from: "2025-01-01",
      to: "2025-01-31",
      per_page: 100,
    });

    console.log(`Found ${accountEntries.data.length} entries for this account`);

    // Search by tags
    const taggedEntries = await client.getEntries({
      tags: "tag1,tag2",
      per_page: 50,
    });

    console.log(
      `Found ${taggedEntries.data.length} entries with specified tags`
    );

    // Get categories with usage counts
    const categories = await client.getCategories();
    categories.data.forEach((category) => {
      console.log(`${category.name}: ${category.counts?.entries || 0} entries`);
    });

    // Get currencies by type
    const cryptoCurrencies = await client.getCurrencies({
      types: "crypto",
    });

    console.log(`Found ${cryptoCurrencies.length} cryptocurrencies`);
  } catch (error) {
    console.error("Search error:", error);
  }
}

// Export and Data Management Examples
async function exportExamples() {
  try {
    // Create an export request
    const exportRequest = await client.createExport({
      resources: "entries",
      formats: "csv",
      filters: {
        from: "2025-01-01",
        to: "2025-12-31",
      },
    });

    console.log("Export created:", exportRequest.id);

    // Poll for export completion
    let exportStatus = exportRequest;
    while (
      exportStatus.status !== "generated" &&
      exportStatus.status !== "error"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      exportStatus = await client.getExport(exportRequest.id);
      console.log(`Export status: ${exportStatus.status}`);
    }

    if (exportStatus.status === "generated") {
      console.log("Export ready for download:", exportStatus.data?.path);
    } else {
      console.error("Export failed");
    }
  } catch (error) {
    console.error("Export error:", error);
  }
}

// Error Handling Best Practices
async function errorHandlingExamples() {
  try {
    await client.getEntry("non-existent-id");
  } catch (error: any) {
    switch (error.name) {
      case "ToshlNotFoundError":
        console.log("Entry not found, handling gracefully");
        break;
      case "ToshlAuthError":
        console.log("Authentication failed, check your token");
        break;
      case "ToshlPermissionError":
        console.log("Permission denied, check account access");
        break;
      case "ToshlValidationError":
        console.log("Invalid data provided:", error.fieldErrors);
        break;
      case "ToshlRateLimitError":
        console.log("Rate limit exceeded, implement backoff logic");
        break;
      case "ToshlNetworkError":
        console.log("Network issue, implement retry logic");
        break;
      default:
        console.log("Unknown error:", error);
    }
  }
}

// Example of a wrapper class with automatic retry and rate limiting
class RobustToshlClient {
  private client: ToshlClient;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(token: string) {
    this.client = new ToshlClient({ token });
  }

  async getEntriesWithRetry(params?: any): Promise<Entry[]> {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        // Check rate limit before making request
        const rateLimit = this.client.getCurrentRateLimitStatus();
        if (rateLimit.remaining < 5) {
          console.log("Rate limit low, waiting...");
          await this.waitForRateLimitReset();
        }

        const response = await this.client.getEntries(params);
        return response.data;
      } catch (error: any) {
        retries++;

        if (error.name === "ToshlRateLimitError" && retries < this.maxRetries) {
          console.log(`Rate limit hit, retry ${retries}/${this.maxRetries}`);
          await this.waitForRateLimitReset();
          continue;
        }

        if (error.name === "ToshlNetworkError" && retries < this.maxRetries) {
          console.log(`Network error, retry ${retries}/${this.maxRetries}`);
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * retries)
          );
          continue;
        }

        throw error;
      }
    }

    throw new Error("Max retries exceeded");
  }

  private async waitForRateLimitReset(): Promise<void> {
    // Simple implementation - wait for the rate limit to reset
    // In production, you might want to parse the Retry-After header
    await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
  }
}

// Run examples
async function runAllExamples() {
  console.log("=== Basic Examples ===");
  await basicExamples();

  console.log("\n=== Pagination Examples ===");
  await paginationExamples();

  console.log("\n=== Advanced Examples ===");
  await advancedExamples();

  console.log("\n=== Search Examples ===");
  await searchExamples();

  console.log("\n=== Export Examples ===");
  await exportExamples();

  console.log("\n=== Error Handling Examples ===");
  await errorHandlingExamples();
}

// Export for use in other files
export {
  basicExamples,
  paginationExamples,
  advancedExamples,
  searchExamples,
  exportExamples,
  errorHandlingExamples,
  RobustToshlClient,
};
