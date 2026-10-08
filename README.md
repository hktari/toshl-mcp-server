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
| `/mcp` | `POST`, `GET`, `DELETE` | Host, Origin, bearer token (static or OAuth) | MCP endpoint, one session per client |
| `/healthz` | `GET`, `HEAD` | Host | Liveness check. Returns `{"status":"ok"}` and nothing else |
| `/.well-known/oauth-*`, `/oauth/*` | see [Sign-in with OAuth](#sign-in-with-oauth) | Host | Only when OAuth is on |

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | `127.0.0.1` | Interface to bind |
| `MCP_HTTP_PORT` | `3000` | Port to bind |
| `MCP_AUTH_TOKEN` | unset | `/mcp` requires `Authorization: Bearer <token>`. At least 32 characters. **Required** in HTTP mode unless OAuth is on or `MCP_ALLOW_NO_AUTH=true` |
| `MCP_ALLOW_NO_AUTH` | unset | `true` (exactly) lets HTTP mode start without `MCP_AUTH_TOKEN`. Only for a proxy that authenticates every request |
| `MCP_ALLOWED_HOSTS` | unset | Comma-separated `Host` names accepted besides `localhost`, `127.0.0.1` and `[::1]` |
| `MCP_ALLOWED_ORIGINS` | unset | Comma-separated origins (`https://host[:port]`) accepted in an `Origin` header on `/mcp` |

### Security

**Anyone who can get a request through to `/mcp` can read and change your Toshl data.**
Each layer below closes a different path to it:

- **Authentication is mandatory.** In HTTP mode the server refuses to start without
  `MCP_AUTH_TOKEN` or the [built-in OAuth server](#sign-in-with-oauth), which is how
  claude.ai connectors sign in. To use an authenticating proxy in front instead, set
  `MCP_ALLOW_NO_AUTH=true`. The server then logs a
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

### Sign-in with OAuth

claude.ai connectors (on the web, Desktop, mobile and Cowork) sign in with OAuth rather
than a fixed header. The server has a small OAuth 2.1 authorization server of its own for
that. There is a single user, and approving a client means typing a passphrase you set.
Add `https://<your host>/mcp` as a custom connector in Claude and leave the OAuth client
on "Use Claude's published identity".

| Variable | Meaning |
| --- | --- |
| `MCP_PUBLIC_URL` | Public origin, e.g. `https://example.com`, without a path. The MCP URL is `<MCP_PUBLIC_URL>/mcp`. Its host is added to `MCP_ALLOWED_HOSTS` automatically |
| `MCP_OAUTH_PASSPHRASE` | Typed on the sign-in page to approve a client. At least 20 characters |
| `MCP_OAUTH_SIGNING_KEY` | Signs access tokens and sign-in forms. At least 32 characters (`openssl rand -hex 32`) |
| `MCP_OAUTH_SIGNING_KEY_PREVIOUS` | Optional. A retired key that still verifies, for rotation without signing everyone out |
| `MCP_OAUTH_STATE_DIR` | Where refresh-token hashes are kept. Must survive restarts (`/app/state` in the image) |
| `MCP_TRUST_PROXY` | `true` to rate-limit by the client address the proxy appends to `X-Forwarded-For`. Turn it on behind a proxy, where otherwise every client shares the proxy's address and one IP's lockout locks out everyone. Leave it off when clients can reach the port directly, because they could then forge the header |

OAuth turns on when the passphrase and signing key are set. It works alongside
`MCP_AUTH_TOKEN`, so Claude Code or a script can keep using a static token.

How it behaves:

- **Clients.** Only Claude (callback `https://claude.ai/api/mcp/auth_callback`) and Claude
  Code (loopback callbacks on `localhost` and `127.0.0.1`, any port, RFC 8252) are
  accepted. Both are pinned by their published client IDs. The server never fetches the
  metadata documents, so it still contacts no host but the Toshl API. Dynamic client
  registration is not offered.
- **PKCE with S256 is required.** The `resource` parameter must name this server, and
  tokens are bound to it.
- **Access tokens** last 1 hour. They are signed with `MCP_OAUTH_SIGNING_KEY` and not
  stored anywhere. Changing the key without keeping the old one as `_PREVIOUS`
  invalidates every access token at once.
- **Refresh tokens** rotate on every use, expire after 30 days unused and 180 days at most,
  and are stored only as SHA-256 hashes in `MCP_OAUTH_STATE_DIR/refresh-tokens.json`.
  - An already-used refresh token may be retried once within 30 seconds, which covers a
    client's two concurrent refreshes.
  - Any other reuse revokes every token from that sign-in.
  - Deleting the file signs every client out.
- **Authorization codes** work once. A failed exchange burns the code. A replayed code
  revokes the tokens the first exchange issued.
- **The sign-in page:**
  - five wrong passphrases from one IP (or one IPv6 /64) lock that address out for 15 minutes
  - twenty from anywhere close sign-in for an hour. Tokens already issued keep working, but
    this means anyone can delay a *new* sign-in by an hour.
  - every failure is delayed by half a second
  - the form only accepts posts from its own origin, and has no scripts, no external
    assets and a strict Content Security Policy
- **Logs** record sign-ins, failures, lockouts and token reuse, with the client ID and
  IP. Passphrases, codes and tokens are never logged.

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

The env file holds `TOSHL_API_TOKEN`, `MCP_ALLOWED_HOSTS`, and either `MCP_AUTH_TOKEN` or
the OAuth settings. Without any of them the container exits at startup unless
`MCP_ALLOW_NO_AUTH=true`. Make the file readable only by its owner (`chmod 600`).
`.dockerignore` keeps every `.env*` file out of the build context.

With OAuth on, mount a volume at `/app/state` (writable by uid 1000) so sign-ins survive
redeploys, e.g. `-v /srv/toshl-mcp/state:/app/state`.

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
