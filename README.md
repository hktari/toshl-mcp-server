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
  - Create tag
  - List budgets
  - Get budget details
  - Get budget history
  - Get user profile
  - Get account summary
  - List entries

- MCP Tools:
  - Account tools (list accounts, get account details)
  - Category tools (list categories, get category details, create category, update category, delete category)
  - Tag tools (list tags, get tag details, create tag, update tag, delete tag)
  - Budget tools (list budgets, get budget details, get budget history)
  - User tools (get profile, get summary, get payment types, get payments)
  - Entry tools (list entries, get entry details, get entry sums, get entry timeline, create entry, update entry, delete entry, manage entries, split entry, undo split)
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
git clone https://github.com/hktari/toshl-mcp-server.git
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

The server speaks MCP over stdio. Point your client at `dist/index.js` and pass
`TOSHL_API_TOKEN` in its environment — step-by-step instructions for **Claude Code**,
**OpenCode**, and **Codex CLI** are in [docs/mcp-clients.md](docs/mcp-clients.md).

For any other client that takes a generic `mcpServers` config:

```json
{
    "mcpServers": {
        "toshl": {
            "command": "node",
            "args": ["/absolute/path/to/toshl-mcp-server/dist/index.js"],
            "env": {
                "TOSHL_API_TOKEN": "your-token"
            }
        }
    }
}
```

## Remote use (Streamable HTTP)

stdio is the default and needs nothing below. To reach the server from clients that can't
spawn a local process (web and mobile apps, a server you run elsewhere), switch it to
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http):

```bash
MCP_TRANSPORT=http MCP_AUTH_TOKEN="$(openssl rand -hex 32)" TOSHL_API_TOKEN=your-token npm start
```

It serves:

| Path | Methods | Checks | Purpose |
| --- | --- | --- | --- |
| `/mcp` | `POST`, `GET`, `DELETE` | Host, Origin, bearer token | MCP endpoint, one session per client |
| `/healthz` | `GET`, `HEAD` | Host | Liveness check. Returns `{"status":"ok"}` and nothing else |

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | `127.0.0.1` | Interface to bind |
| `MCP_HTTP_PORT` | `3000` | Port to bind |
| `MCP_AUTH_TOKEN` | unset | `/mcp` requires `Authorization: Bearer <token>`. At least 32 characters. **Required** in HTTP mode unless `MCP_ALLOW_NO_AUTH=true` |
| `MCP_ALLOW_NO_AUTH` | unset | `true` (exactly) lets HTTP mode start without `MCP_AUTH_TOKEN`. Only for a proxy that authenticates every request |
| `MCP_ALLOWED_HOSTS` | unset | Comma-separated `Host` names accepted besides `localhost`, `127.0.0.1` and `[::1]` |
| `MCP_ALLOWED_ORIGINS` | unset | Comma-separated origins (`https://host[:port]`) accepted in an `Origin` header on `/mcp` |

### Security

**Anyone who can get a request through to `/mcp` can read and change your Toshl data.**
Each layer below closes a different path to it:

- **Authentication is mandatory.** In HTTP mode the server refuses to start without
  `MCP_AUTH_TOKEN`. If your client can't send a custom header, put an authenticating
  proxy in front and set `MCP_ALLOW_NO_AUTH=true`. The server then logs a
  `SECURITY WARNING` at error level on every start. Never expose `/mcp` without
  authentication, and don't count on an unguessable URL to protect it.
- **TLS and loopback.** Keep the default loopback bind and reach the server only through
  a TLS-terminating reverse proxy. The bearer token travels in a header, so plain HTTP
  across a network gives it away.
- **Host check (DNS rebinding).** Every request's `Host` must be loopback or listed in
  `MCP_ALLOWED_HOSTS`. That stops a web page you visit from pointing its own name at
  `127.0.0.1` and driving a local server. A proxy usually forwards the public name as
  `Host`, so list that name.
- **Origin check.** As the MCP spec requires, `/mcp` validates `Origin`. Requests without
  one are accepted, because native clients, CLIs and server-side connectors don't send it.
  A present `Origin`, including the opaque `null`, must be listed in `MCP_ALLOWED_ORIGINS`
  or the request gets `403`, before authentication is even checked. The list is empty by
  default, so no browser page can call `/mcp` unless you allow it.

```
# Caddyfile: automatic TLS, forwards Host unchanged
example.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
MCP_ALLOWED_HOSTS=example.com
```

### Sessions

Sessions are held in memory. A session with no request for 30 minutes is closed, and the
client opens a new one on its next call. `SIGTERM` and `SIGINT` close every session
before exiting.

### Docker

The `Dockerfile` builds an image that starts in HTTP mode, listening on port 3000 as the
unprivileged `node` user. Inside the container it binds `0.0.0.0` so the published port
can reach it. Publish that port on loopback only, and pass secrets at run time; the image
contains none:

```bash
docker build -t toshl-mcp-server .
docker run -d --restart unless-stopped \
    -p 127.0.0.1:3000:3000 \
    --env-file /path/outside/the/repo/toshl-mcp.env \
    toshl-mcp-server
```

The env file holds `TOSHL_API_TOKEN`, `MCP_AUTH_TOKEN` and `MCP_ALLOWED_HOSTS`. Without
`MCP_AUTH_TOKEN` the container exits at startup unless `MCP_ALLOW_NO_AUTH=true`. Make the
file readable only by its owner (`chmod 600`). `.dockerignore` keeps every `.env*` file
out of the build context.

## Development

Run the server in development mode:

```bash
npm run dev
```

## Documentation

- [Installing in MCP clients (Claude Code, OpenCode, Codex)](docs/mcp-clients.md)
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
- `MCP_TRANSPORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_AUTH_TOKEN`, `MCP_ALLOW_NO_AUTH`,
  `MCP_ALLOWED_HOSTS`, `MCP_ALLOWED_ORIGINS`:
  see [Remote use (Streamable HTTP)](#remote-use-streamable-http)

## License

MIT
