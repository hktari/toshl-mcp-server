# Toshl API TypeScript Client

A comprehensive, fully-typed TypeScript client for the Toshl API with built-in support for pagination, rate limiting, error handling, and conflict resolution.

## Features

- ✅ **Full TypeScript Support** - Complete type definitions generated from official Toshl API schemas
- ✅ **Pagination Helpers** - Built-in support for Toshl's Link header pagination
- ✅ **Rate Limiting** - Automatic rate limit monitoring and status tracking
- ✅ **Error Handling** - Custom error classes for different API error types
- ✅ **Conflict Resolution** - Built-in handling for 409 Conflict errors
- ✅ **Axios-based** - Uses Axios for reliable HTTP requests with interceptors
- ✅ **Resource Management** - Full CRUD operations for all API endpoints
- ✅ **Search & Filtering** - Support for all Toshl API search parameters

## Installation

```bash
npm install axios
# or
yarn add axios
```

## Quick Start

```typescript
import { ToshlClient } from './src/toshl-client';

// Initialize the client
const client = new ToshlClient({
  token: 'your-toshl-api-token',
  baseURL: 'https://api.toshl.com',
  timeout: 10000
});

// Get all accounts
const accounts = await client.getAccounts();
console.log(accounts.data);

// Create a new entry
const entry = await client.createEntry({
  amount: -25.50,
  currency: { code: 'USD' },
  date: '2025-01-15',
  desc: 'Coffee shop',
  account: 'account-id',
  category: 'food'
});
```

## API Reference

### Client Configuration

```typescript
interface ToshlClientConfig {
  token: string;           // Your Toshl API token
  baseURL?: string;        // API base URL (default: https://api.toshl.com)
  timeout?: number;        // Request timeout in ms (default: 10000)
  defaultPerPage?: number; // Default pagination size (default: 200)
}
```

### Core Methods

#### Accounts
```typescript
// List accounts with pagination
const accounts = await client.getAccounts({ page: 0, per_page: 50 });

// Get specific account
const account = await client.getAccount('account-id');

// Create account
const newAccount = await client.createAccount({
  name: 'My Bank Account',
  type: 'depository',
  balance: 1000
});

// Update account
const updated = await client.updateAccount('account-id', {
  name: 'Updated Account Name'
});

// Delete account
await client.deleteAccount('account-id');
```

#### Entries
```typescript
// List entries with filters
const entries = await client.getEntries({
  from: '2025-01-01',
  to: '2025-01-31',
  account: 'account-id',
  category: 'category-id',
  tags: 'tag1,tag2',
  per_page: 100
});

// Get specific entry
const entry = await client.getEntry('entry-id');

// Create entry
const newEntry = await client.createEntry({
  amount: -25.50,
  currency: { code: 'USD' },
  date: '2025-01-15',
  desc: 'Coffee shop',
  account: 'account-id',
  category: 'category-id',
  tags: ['tag-id']
});

// Update entry
const updated = await client.updateEntry('entry-id', {
  desc: 'Updated description'
});

// Delete entry
await client.deleteEntry('entry-id');
```

#### Budgets
```typescript
// List budgets
const budgets = await client.getBudgets();

// Get specific budget
const budget = await client.getBudget('budget-id');

// Create budget
const newBudget = await client.createBudget({
  name: 'Monthly Food Budget',
  limit: 500,
  currency: { code: 'USD' },
  type: 'monthly'
});

// Update budget
const updated = await client.updateBudget('budget-id', {
  limit: 600
});

// Delete budget
await client.deleteBudget('budget-id');
```

#### Categories & Tags
```typescript
// Categories
const categories = await client.getCategories();
const category = await client.getCategory('category-id');
const newCategory = await client.createCategory({ name: 'Food', type: 'expense' });

// Tags
const tags = await client.getTags();
const tag = await client.getTag('tag-id');
const newTag = await client.createTag({ name: 'restaurant', type: 'expense' });
```

#### Currencies & Exports
```typescript
// Get supported currencies
const currencies = await client.getCurrencies({
  types: 'fiat'  // or 'crypto', 'commodity'
});

// Create data export
const exportRequest = await client.createExport({
  resources: 'entries',
  formats: 'csv',
  filters: {
    from: '2025-01-01',
    to: '2025-12-31'
  }
});
```

## Pagination

### Basic Pagination
```typescript
const response = await client.getEntries({ per_page: 100 });
console.log(response.data);           // Current page data
console.log(response.pagination);    // Pagination links
console.log(response.headers);       // Rate limit info
```

### Advanced Pagination with Helper
```typescript
import { PaginationHelper } from './src/pagination-helpers';

const helper = new PaginationHelper<Entry>(client, '/entries', {
  from: '2025-01-01',
  to: '2025-12-31'
});

// Get all pages automatically
const allEntries = await helper.getAllPages();

// Iterate through pages
for await (const page of helper.iteratePages()) {
  console.log(`Page ${helper.getCurrentPageNumber()}: ${page.data.length} entries`);
  
  // Stop if rate limit is low
  if (page.headers['X-RateLimit-Remaining'] < 10) {
    break;
  }
}

// Iterate through individual items
for await (const entry of helper.iterateItems()) {
  console.log(entry.desc, entry.amount);
}
```

### Utility Functions
```typescript
import { fetchAllPages, fetchPageRange } from './src/pagination-helpers';

// Fetch all pages of a resource
const allBudgets = await fetchAllPages<Budget>(client, '/budgets');

// Fetch a specific range of pages
const someEntries = await fetchPageRange<Entry>(
  client, 
  '/entries', 
  0,  // start page
  5   // end page
);
```

## Rate Limiting

### Monitor Rate Limits
```typescript
// Get current rate limit status
const status = await client.getRateLimitStatus();
console.log(`${status.remaining}/${status.limit} requests remaining`);

// Check cached status
const cached = client.getCurrentRateLimitStatus();
console.log(cached.remaining);

// Check if rate limit is exceeded
if (client.isRateLimitExceeded()) {
  console.log('Rate limit exceeded!');
}
```

### Rate Limit Headers
All responses include rate limit information:
```typescript
const response = await client.getEntries();
console.log(response.headers['X-RateLimit-Limit']);      // Total limit
console.log(response.headers['X-RateLimit-Remaining']);  // Remaining requests
```

## Error Handling

### Custom Error Classes
```typescript
try {
  await client.getEntry('non-existent-id');
} catch (error) {
  if (error instanceof ToshlNotFoundError) {
    console.log('Entry not found');
  } else if (error instanceof ToshlValidationError) {
    console.log('Validation error:', error.fieldErrors);
  } else if (error instanceof ToshlRateLimitError) {
    console.log('Rate limit exceeded');
  } else if (error instanceof ToshlAuthError) {
    console.log('Authentication failed');
  } else if (error instanceof ToshlPermissionError) {
    console.log('Permission denied');
  } else if (error instanceof ToshlConflictError) {
    console.log('Conflict detected:', error.conflictData);
  } else if (error instanceof ToshlNetworkError) {
    console.log('Network error');
  }
}
```

### Conflict Resolution
```typescript
try {
  await client.updateEntry('entry-id', { desc: 'Updated' });
} catch (error) {
  if (error instanceof ToshlConflictError) {
    // Fetch fresh data and retry
    const freshEntry = await client.getEntry('entry-id');
    await client.updateEntry('entry-id', {
      desc: 'Updated',
      modified: freshEntry.modified  // Use fresh modified timestamp
    });
  }
}
```

## Advanced Usage

### Robust Client with Retry Logic
```typescript
class RobustToshlClient {
  constructor(private client: ToshlClient) {}

  async getEntriesWithRetry(params?: any): Promise<Entry[]> {
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const response = await this.client.getEntries(params);
        return response.data;
      } catch (error) {
        retries++;
        
        if (error instanceof ToshlRateLimitError && retries < maxRetries) {
          await this.waitForRateLimitReset();
          continue;
        }
        
        if (error instanceof ToshlNetworkError && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  private async waitForRateLimitReset(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}
```

### Bulk Operations
```typescript
// Create multiple entries with rate limit awareness
async function createBulkEntries(entries: Partial<Entry>[]): Promise<Entry[]> {
  const results: Entry[] = [];
  
  for (const entryData of entries) {
    const rateLimit = client.getCurrentRateLimitStatus();
    
    if (rateLimit.remaining < 5) {
      console.log('Rate limit low, waiting...');
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
    
    try {
      const entry = await client.createEntry(entryData);
      results.push(entry);
    } catch (error) {
      console.error('Failed to create entry:', error);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}
```

## Type Safety

The client provides full TypeScript type safety:

```typescript
// All methods return properly typed responses
const accounts: PaginatedResponse<Account> = await client.getAccounts();
const entry: Entry = await client.getEntry('entry-id');
const budget: Budget = await client.createBudget({ ... });

// Parameters are strongly typed
client.getEntries({
  from: '2025-01-01',    // Type: string | undefined
  to: '2025-01-31',      // Type: string | undefined
  per_page: 100,         // Type: number | undefined
  account: 'account-id'  // Type: string | undefined
});
```

## API Endpoints Covered

- ✅ `/me` - User information
- ✅ `/accounts` - Account management
- ✅ `/entries` - Expense/income entries
- ✅ `/budgets` - Budget management
- ✅ `/categories` - Category management
- ✅ `/tags` - Tag management
- ✅ `/currencies` - Currency information
- ✅ `/exports` - Data exports
- ✅ `/rate-limit` - Rate limit status

## Best Practices

1. **Monitor Rate Limits**: Always check rate limit status before bulk operations
2. **Handle Conflicts**: Implement proper conflict resolution for updates
3. **Use Pagination**: Never assume you have all data - use pagination helpers
4. **Error Handling**: Use specific error classes for different error types
5. **Retry Logic**: Implement exponential backoff for network errors
6. **Caching**: Cache rate limit status to avoid unnecessary API calls

## Examples

See `examples/usage-examples.ts` for comprehensive examples including:
- Basic CRUD operations
- Pagination patterns
- Error handling strategies
- Rate limit management
- Bulk operations
- Export workflows

## Contributing

The client is generated from the official Toshl API schemas. To update types:

1. Download the latest schema: `curl -H "Authorization: Bearer $TOKEN" https://api.toshl.com/schema > schema.json`
2. Regenerate types: `quicktype -l ts --just-types -o toshl-api-types.ts schema.json`
3. Update client methods as needed

## License

This TypeScript client is provided as-is for use with the Toshl API. Please refer to the Toshl API terms of service for usage guidelines.
