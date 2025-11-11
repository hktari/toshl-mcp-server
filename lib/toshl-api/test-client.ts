import { ToshlClient } from "./toshl-client";
import { PaginationHelper } from "./pagination-helpers";
import { Category } from "./toshl-api-response-types";

async function testClient() {
  // Initialize client with token from environment
  const token = process.env.TOSHL_API_TOKEN;
  if (!token) {
    console.error("Please set TOSHL_API_TOKEN environment variable");
    process.exit(1);
  }

  const client = new ToshlClient({ token });

  try {
    console.log("🧪 Testing Toshl API TypeScript Client...\n");

    // Test 1: Rate limit status
    console.log("1️⃣ Checking rate limit status...");
    const rateLimit = await client.getRateLimitStatus();
    console.log(
      `   ✅ Rate limit: ${rateLimit.remaining}/${rateLimit.limit}\n`
    );

    // Test 2: Get accounts
    console.log("2️⃣ Fetching accounts...");
    const accounts = await client.getAccounts({ per_page: 5 });
    console.log(`   ✅ Found ${accounts.data.length} accounts`);
    console.log(
      `   📄 Pagination: ${JSON.stringify(accounts.pagination, null, 2)}\n`
    );

    // Test 3: Get entries with pagination
    console.log("3️⃣ Testing pagination with entries...");
    const entries = await client.getEntries({
      from: "2025-01-01",
      to: "2025-01-31",
      per_page: 10,
    });
    console.log(`   ✅ Found ${entries.data.length} entries in date range`);
    console.log(
      `   📊 Rate limit remaining: ${entries.headers["X-RateLimit-Remaining"]}\n`
    );

    // Test 4: Pagination helper
    console.log("4️⃣ Testing PaginationHelper...");
    const helper = new PaginationHelper(client, "/accounts", { per_page: 2 });
    const firstPage = await helper.getCurrentPage();
    console.log(
      `   ✅ Helper page ${helper.getCurrentPageNumber()}: ${firstPage.data.length} accounts`
    );
    console.log(`   🔗 Has next page: ${helper.hasNextPage()}\n`);

    // Test 5: Categories
    console.log("5️⃣ Fetching categories...");
    const categories = await client.getCategories();
    console.log(`   ✅ Found ${categories.data.length} categories`);

    // Show category with usage stats
    if (categories.data.length > 0) {
      const category = categories.data[0];
      console.log(
        `   📈 Example category "${category.name}": ${category.counts?.entries || 0} entries\n`
      );
    }

    // Test 6: Currencies
    console.log("6️⃣ Fetching currencies...");
    const currencies = await client.getCurrencies({ types: "fiat" });
    console.log(`   ✅ Found ${currencies.length} fiat currencies\n`);

    // Test 7: Error handling
    console.log("7️⃣ Testing error handling...");
    try {
      await client.getAccount("non-existent-id");
    } catch (error: any) {
      if (error.name === "ToshlNotFoundError") {
        console.log("   ✅ Properly handled 404 error\n");
      }
    }

    console.log(
      "🎉 All tests passed! The TypeScript client is working correctly.\n"
    );

    // Show current rate limit
    const finalRateLimit = client.getCurrentRateLimitStatus();
    console.log(
      `📊 Final rate limit status: ${finalRateLimit.remaining}/${finalRateLimit.limit}`
    );
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);

    if (error.name === "ToshlAuthError") {
      console.error("   🔑 Authentication failed - check your API token");
    } else if (error.name === "ToshlRateLimitError") {
      console.error("   ⏱️ Rate limit exceeded - please wait before retrying");
    } else if (error.name === "ToshlValidationError") {
      console.error("   ⚠️ Validation error:", error.fieldErrors);
    } else {
      console.error("   📝 Full error:", error);
    }

    process.exit(1);
  }
}

// Run the test
testClient();

export { testClient };
