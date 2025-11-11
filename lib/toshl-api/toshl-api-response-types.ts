// Toshl API Response Types
// These are the actual types for API responses, not the schema definitions

export interface Account {
  id: string;
  parent?: string;
  name: string;
  name_override?: boolean;
  type: 'custom' | 'depository' | 'credit_card' | 'loan' | 'mortgage' | 'brokerage' | 'investment' | 'savings' | 'other';
  balance: number;
  initial_balance: number;
  limit?: number;
  currency: Currency;
  goal?: Goal;
  extra?: Record<string, any>;
  modified: string;
  position?: number;
  order?: number;
  connection?: Connection;
  memo?: string;
  payee?: string;
  pending?: boolean;
  completed?: boolean;
  deleted?: boolean;
}

export interface Currency {
  code: string;
  rate?: number;
  main_rate?: number;
  fixed?: boolean;
}

export interface Goal {
  type: string;
  amount?: number;
  date?: string;
}

export interface Connection {
  id: string;
  service: string;
  status: string;
}

export interface Entry {
  id: string;
  amount: number;
  currency: Currency;
  date: string;
  desc?: string;
  account: string;
  category?: string;
  tags?: string[];
  location?: Location;
  created: string;
  modified: string;
  repeat?: Repeat;
  transaction?: Transaction;
  images?: EntryImage[];
  reminders?: Reminder[];
  import?: string;
  review?: string;
  settle?: string;
  split?: Split;
  completed?: boolean;
  deleted?: boolean;
  extra?: Record<string, any>;
}

export interface Location {
  id: string;
  venue_id?: string;
  latitude?: number;
  longitude?: number;
}

export interface Repeat {
  id: string;
  start: string;
  end?: string;
  frequency: string;
  interval: number;
  count?: number;
  byday?: string;
  bymonthday?: string;
  bysetpos?: string;
  iteration: number;
}

export interface Transaction {
  id: string;
  amount: number;
  account: string;
  currency: Currency;
}

export interface EntryImage {
  id: string;
  path: string;
  filename: string;
  type: string;
  status: string;
}

export interface Reminder {
  period: 'day' | 'week' | 'month' | 'year';
  number: number;
  at: string;
}

export interface Split {
  parent: string;
}

export interface Budget {
  id: string;
  parent?: string;
  name: string;
  limit: number;
  limit_planned?: number;
  amount: number;
  planned?: number;
  currency: Currency;
  type: 'monthly' | 'weekly' | 'yearly' | 'custom';
  status: 'active' | 'inactive' | 'archived';
  from: string;
  to?: string;
  categories?: string[];
  tags?: string[];
  accounts?: string[];
  modified: string;
  deleted?: boolean;
}

export interface Category {
  id: string;
  name: string;
  name_override?: boolean;
  modified: string;
  type: 'expense' | 'income' | 'system';
  deleted?: boolean;
  counts?: CategoryCounts;
}

export interface CategoryCounts {
  entries: number;
  income_entries?: number;
  expense_entries?: number;
  tags_used_with_category?: number;
  income_tags_used_with_category?: number;
  expense_tags_used_with_category?: number;
}

export interface Tag {
  id: string;
  name: string;
  name_override?: boolean;
  modified: string;
  type: 'expense' | 'income';
  category?: string;
  counts: TagCounts;
  deleted?: boolean;
  meta_tag?: boolean;
  extra?: Record<string, any>;
}

export interface TagCounts {
  entries: number;
  unsorted_entries: number;
  budgets: number;
}

export interface CurrencyElement {
  name: string;
  symbol: string;
  precision: number;
  modified: string;
  type: 'fiat' | 'commodity' | 'crypto' | 'deprecated';
}

export interface Export {
  id: string;
  resources: 'entries' | 'budgets' | 'accounts' | 'categories' | 'tags';
  formats: 'csv' | 'pdf' | 'xls' | 'xlsx' | 'json' | 'zip';
  filters: ExportFilters;
  from?: string;
  to?: string;
  created: string;
  modified: string;
  status: 'sending' | 'sent' | 'error' | 'generating' | 'generated';
  type: 'export' | 'attachments' | 'user_data';
  seen?: boolean;
  data?: ExportData;
}

export interface ExportFilters {
  account?: string[];
  category?: string[];
  tag?: string[];
  status?: string[];
}

export interface ExportData {
  path: string;
  url?: string;
  size?: number;
  filename?: string;
}

export interface Me {
  id: string;
  email: string;
  name?: string;
  main_currency: string;
  timezone: string;
  date_format: string;
  decimal_format: string;
  thousand_format: string;
  account_limit: number;
  budget_limit: number;
  export_limit: number;
  api_status: string;
  trial?: boolean;
  trial_end?: string;
  subscription?: Subscription;
  created: string;
  modified: string;
}

export interface Subscription {
  id: string;
  status: string;
  plan: string;
  period: string;
  amount: number;
  currency: string;
  next_payment: string;
  cancelled?: boolean;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
}

// Error types
export interface ToshlAPIError {
  error_id: string;
  description: string;
  field_errors?: FieldError[];
  query_param_errors?: QueryParamError[];
  form_param_errors?: FormParamError[];
  request_errors?: RequestError[];
}

export interface FieldError {
  field_error_id: string;
  description: string;
  field: string;
  constraint_attributes?: any;
  constraint_name?: string;
  data?: any;
}

export interface QueryParamError {
  query_param_error_id: string;
  description: string;
  param: string;
  constraint_attributes?: any;
  constraint_name?: string;
  data?: any;
}

export interface FormParamError {
  form_param_error_id: string;
  description: string;
  param: string;
  constraint_attributes?: any;
  constraint_name?: string;
  data?: any;
}

export interface RequestError {
  request_error_id: string;
  description: string;
  constraint_attributes?: any;
  constraint_name?: string;
  data?: any;
}
