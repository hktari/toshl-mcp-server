# Toshl MCP Server

An MCP (Model Context Protocol) server for integrating [Toshl Finance](https://toshl.com/) with AI agents.

## Overview

The Toshl MCP Server provides a bridge between AI agents and the Toshl Finance API. It allows AI agents to access financial data from Toshl, analyze it, and provide insights and advice based on the data.

## Features

- READ access to Toshl Finance API endpoints:

  - Accounts
  - Categories
  - Tags
  - Budgets
  - User information
  - Planning

- MCP Resources:

  - List accounts
  - Get account details
  - List categories
  - Get category details
  - List tags
  - Get tag details
  - List budgets
  - Get budget details
  - Get budget history
  - Get user profile
  - Get account summary
  - List entries

- MCP Tools:
  - Account tools (list accounts, get account details)
  - Category tools (list categories, get category details)
  - Tag tools (list tags, get tag details)
  - Budget tools (list budgets, get budget details, get budget history)
  - User tools (get profile, get summary, get payment types, get payments)
  - Entry tools (list entries, get entry details, get entry sums, get entry timeline, create entry, update entry, delete entry, manage entries)
  - Analysis tools (analyze spending by category, analyze budget performance, analyze account balances)

## Prerequisites

- Node.js (v18.x or higher)
- npm (v8.x or higher)
- Toshl Finance API token

## Get API Token

1. go to https://developer.toshl.com/apps/
2. create new personal token. Insert name for token under "Description" and your account password under "Password"

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/toshl-mcp-server.git
cd toshl-mcp-server
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on the `.env.example` file:

```bash
cp .env.example .env
```

4. Edit the `.env` file and add your Toshl API token:

```
TOSHL_API_TOKEN=your_api_token
```

## Building

Build the project:

```bash
npm run build
```

## Running

Start the server:

```bash
npm start
```

## Configure MCP server

```
 "toshl-mcp-server": {
      "command": "node",
      "args": [
        "/root/source/personal/toshl-mcp-server/dist/src/index.js"
      ],
      "env": {
        "TOSHL_API_TOKEN": "your-token",
        "TOSHL_API_BASE_URL": "https://api.toshl.com",
        "MCP_SERVER_NAME": "toshl-mcp-server",
        "MCP_SERVER_VERSION": "0.1.0",
        "CACHE_TTL": "3600",
        "CACHE_ENABLED": "true",
        "LOG_LEVEL": "debug"
      },
      "disabled": false,
      "autoApprove": []
    }
```

## Development

Run the server in development mode:

```bash
npm run dev
```

## Documentation

- [API Overview](docs/api/overview.md)
- [Authentication](docs/api/auth.md)
- [Accounts](docs/api/accounts.md)
- [Entries](docs/api/entries.md)
- [Transfers](docs/api/transfers.md)

## Project Structure

```
toshl-mcp-server/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server/                  # MCP server implementation
│   │   └── server.ts            # Main server class
│   ├── api/                     # Toshl API client
│   │   ├── toshl-client.ts      # Base API client
│   │   ├── auth.ts              # Authentication module
│   │   └── endpoints/           # Endpoint-specific clients
│   │       ├── accounts.ts      # Accounts API client
│   │       ├── categories.ts    # Categories API client
│   │       ├── tags.ts          # Tags API client
│   │       ├── budgets.ts       # Budgets API client
│   │       ├── entries.ts       # Entries API client
│   │       ├── me.ts            # User API client
│   │       └── planning.ts      # Planning API client
│   ├── resources/               # MCP resource handlers
│   │   ├── account-resources.ts # Account resources
│   │   ├── category-resources.ts# Category resources
│   │   ├── tag-resources.ts     # Tag resources
│   │   ├── budget-resources.ts  # Budget resources
│   │   └── user-resources.ts    # User resources
│   ├── tools/                   # MCP tool handlers
│   │   ├── account-tools.ts     # Account tools
│   │   ├── category-tools.ts    # Category tools
│   │   ├── tag-tools.ts         # Tag tools
│   │   ├── budget-tools.ts      # Budget tools
│   │   ├── user-tools.ts        # User tools
│   │   └── analysis-tools.ts    # Financial analysis tools
│   └── utils/                   # Utility functions
│       ├── cache.ts             # Caching utilities
│       ├── error-handler.ts     # Error handling utilities
│       ├── logger.ts            # Logging utilities
│       └── types.ts             # TypeScript type definitions
├── dist/                        # Compiled JavaScript files
├── .env                         # Environment variables
├── .env.example                 # Example environment variables
├── package.json                 # Project dependencies
├── tsconfig.json                # TypeScript configuration
└── README.md                    # Project documentation
```

## Configuration

The server can be configured using environment variables:

- `TOSHL_API_TOKEN`: Your Toshl API token
- `TOSHL_API_BASE_URL`: The base URL for the Toshl API (default: https://api.toshl.com)
- `MCP_SERVER_NAME`: The name of the MCP server (default: toshl-mcp-server)
- `MCP_SERVER_VERSION`: The version of the MCP server (default: 0.1.0)
- `CACHE_TTL`: Time to live for cached data in seconds (default: 3600)
- `CACHE_ENABLED`: Whether caching is enabled (default: true)
- `LOG_LEVEL`: Logging level (default: info)

## License

MIT
