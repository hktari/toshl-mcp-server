/**
 * Types for Toshl API responses and MCP server
 */

// Toshl API Types

export interface ToshlAccount {
    id: string;
    name: string;
    balance: number;
    initial_balance: number;
    currency: ToshlCurrency;
    median?: {
        expenses: number;
        incomes: number;
    };
    status: 'active' | 'inactive' | 'archived';
    order: number;
    modified: string;
    goal?: {
        amount: number;
        start: string;
        end: string;
    };
    [key: string]: any; // For additional properties
}

export interface ToshlCategory {
    id: string;
    name: string;
    modified: string;
    type: 'expense' | 'income' | 'system';
    [key: string]: any; // For additional properties
}

export interface ToshlTag {
    id: string;
    name: string;
    modified: string;
    type?: 'expense' | 'income';
    category?: string;
    [key: string]: any; // For additional properties
}

export interface ToshlTagPage {
    tags: ToshlTag[];
    /** Zero-based index of the following page, or null on the last page */
    nextPage: number | null;
}

export interface ToshlBudget {
    id: string;
    name: string;
    amount: number;
    currency: ToshlCurrency;
    from: string;
    to: string;
    modified: string;
    [key: string]: any; // For additional properties
}

export interface ToshlCurrency {
    code: string;
    rate: number;
    fixed: boolean;
    [key: string]: any; // For additional properties
}

export interface ToshlUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    joined: string;
    modified: string;
    pro?: any;
    currency?: ToshlCurrency;
    [key: string]: any; // For additional properties
}

export interface ToshlPlanning {
    id: string;
    name: string;
    modified: string;
    [key: string]: any; // For additional properties
}

export interface ToshlLocation {
    id?: string;
    venue_id?: string;
    latitude?: number;
    longitude?: number;
    [key: string]: any; // For additional properties
}

export interface ToshlRepeat {
    id: string;
    frequency: string;
    interval: number;
    start: string;
    end?: string;
    count?: number;
    iteration?: number;
    template?: boolean;
    [key: string]: any; // For additional properties
}

export interface ToshlTransaction {
    id: string;
    account: string;
    currency: ToshlCurrency;
    [key: string]: any; // For additional properties
}

export interface ToshlImage {
    id: string;
    path: string;
    status: string;
    [key: string]: any; // For additional properties
}

export interface ToshlReminder {
    period: string;
    number: number;
    at: string;
    [key: string]: any; // For additional properties
}

export interface ToshlEntrySplit {
    /** Set on a split child: the id of the entry it was split from */
    parent?: string;
    /** Ids of every child of the split, on the parent and on each child */
    children?: string[];
}

export interface ToshlEntry {
    id: string;
    amount: number;
    currency: ToshlCurrency;
    date: string;
    desc: string;
    account: string;
    category: string;
    tags?: string[];
    location?: ToshlLocation;
    modified: string;
    repeat?: ToshlRepeat;
    transaction?: ToshlTransaction;
    images?: ToshlImage[];
    reminders?: ToshlReminder[];
    completed?: boolean;
    split?: ToshlEntrySplit;
    deleted?: boolean;
    [key: string]: any; // For additional properties
}

export interface ToshlEntryPage {
    entries: ToshlEntry[];
    /** Zero-based index of the following page, or null on the last page */
    nextPage: number | null;
}

export interface ToshlEntrySum {
    day: string;
    expenses?: {
        sum: number;
        count: number;
    };
    incomes?: {
        sum: number;
        count: number;
    };
    modified: string;
    [key: string]: any; // For additional properties
}

export interface ToshlTimelineItem {
    day: string;
    sum: number;
    count: number;
    currency: string;
    entries: ToshlEntry[];
    [key: string]: any; // For additional properties
}

// API Client Types

export interface ApiClientConfig {
    baseUrl: string;
    token: string;
    /** Per-attempt request timeout in milliseconds */
    timeout?: number;
    /** Extra attempts for a request that never reached Toshl, or that Toshl called temporary */
    retries?: number;
    /** Pause before the first retry in milliseconds; doubles for each further one */
    retryDelayMs?: number;
}

export interface ApiResponse<T> {
    data: T;
    status: number;
    headers: Record<string, string>;
}

export interface ApiError {
    status: number;
    message: string;
    /** Toshl's error identifier, e.g. `input_error` (see docs/api/errors.md) */
    id?: string;
    details?: any;
    /** HTTP method of the failed request, lower-case; a write is reported differently from a read */
    method?: string;
    /** Seconds Toshl asked the caller to wait, from the Retry-After header of a 429 */
    retryAfterSeconds?: number;
}

// Cache Types

export interface CacheConfig {
    enabled: boolean;
    ttl: number; // Time to live in seconds
}

// MCP Server Types

export interface ServerConfig {
    name: string;
    version: string;
}

// Tool Types

export interface ToolInput {
    [key: string]: any;
}

export interface ToolOutput {
    [key: string]: any;
}

// Resource Types

export interface ResourceParams {
    [key: string]: string;
}
