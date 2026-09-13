# Installing in MCP clients

This guide wires the server into Claude Code, OpenCode, and Codex CLI. All three run it
as a local **stdio** process, so the recipe is the same: build once, then point the client
at `dist/index.js` and hand it your `TOSHL_API_TOKEN`.

The token reaches your real Toshl ledger — balances, full transaction history, budgets.
Every snippet below reads it from your shell environment instead of writing it into a
config file, so nothing secret lands in a file you might commit or share.

## 1. Build the server

The package is not published to npm; install it from a clone.

```bash
git clone https://github.com/hktari/toshl-mcp-server.git
cd toshl-mcp-server
npm install
npm run build
```

Note the absolute path of `dist/index.js` — every client config below needs it:

```bash
echo "$(pwd)/dist/index.js"
```

## 2. Export your token

Generate a personal token at <https://developer.toshl.com/apps/>, then put it in the
environment of the shell you launch the client from — for example in `~/.zshrc` or
`~/.bashrc`:

```bash
export TOSHL_API_TOKEN='your-toshl-token'
```

Optional variables (`TOSHL_API_BASE_URL`, `CACHE_TTL`, `CACHE_ENABLED`, `LOG_LEVEL`) are
listed in the [README](../README.md#configuration) and can be exported the same way.

## 3. Register the server

### Claude Code

Add it once for all projects (`--scope user`):

```bash
claude mcp add toshl --transport stdio --scope user \
  -e TOSHL_API_TOKEN="$TOSHL_API_TOKEN" \
  -- node /absolute/path/to/toshl-mcp-server/dist/index.js
```

Or commit a project-level `.mcp.json` so teammates get the same setup. Claude Code expands
`${VAR}` at startup, so the file can be committed without the token in it:

```json
{
    "mcpServers": {
        "toshl": {
            "type": "stdio",
            "command": "node",
            "args": ["/absolute/path/to/toshl-mcp-server/dist/index.js"],
            "env": {
                "TOSHL_API_TOKEN": "${TOSHL_API_TOKEN}"
            }
        }
    }
}
```

Verify: start `claude` and run `/mcp`. `toshl` should show as connected with its tools
listed.

### OpenCode

OpenCode is configured through `opencode.json` — project-level in the repo root, or user-level
at `~/.config/opencode/opencode.json`. Local servers use `"type": "local"` with the command
as an array, and `{env:VAR}` reads from your shell environment:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "mcp": {
        "toshl": {
            "type": "local",
            "command": ["node", "/absolute/path/to/toshl-mcp-server/dist/index.js"],
            "enabled": true,
            "environment": {
                "TOSHL_API_TOKEN": "{env:TOSHL_API_TOKEN}"
            }
        }
    }
}
```

Verify:

```bash
opencode mcp list
```

### Codex CLI

Add it from the command line:

```bash
codex mcp add toshl \
  --env TOSHL_API_TOKEN="$TOSHL_API_TOKEN" \
  -- node /absolute/path/to/toshl-mcp-server/dist/index.js
```

Or edit `~/.codex/config.toml` directly. `env_vars` forwards the named variables from the
shell Codex was launched in, so the token never has to appear in the file:

```toml
[mcp_servers.toshl]
command = "node"
args = ["/absolute/path/to/toshl-mcp-server/dist/index.js"]
env_vars = ["TOSHL_API_TOKEN"]
```

Verify:

```bash
codex mcp list
```

## 4. Try it

Ask the assistant something that needs the server, for example *"list my Toshl accounts"*
— it should call the `account_list` tool and return your accounts.

## Troubleshooting

- **Server not listed / fails to start** — run it by hand to see the error:
  `TOSHL_API_TOKEN=... node /absolute/path/to/toshl-mcp-server/dist/index.js`. A missing
  `dist/` means `npm run build` has not been run.
- **`Missing token for basic authentication`** — the client was launched from a shell
  that does not have `TOSHL_API_TOKEN`. GUI-launched apps often do not inherit `~/.zshrc`;
  either start the client from a terminal or use the CLI `add` command, which captures the
  value at add time.
- **401 from Toshl** — the token is wrong or revoked. Generate a new one at
  <https://developer.toshl.com/apps/> and re-export it.
- **More detail** — set `LOG_LEVEL=debug` alongside the token. Logs never include the
  token.
