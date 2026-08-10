# toshl-mcp-server

An MCP server bridging an AI assistant to the [Toshl Finance](https://toshl.com) API.
Users run it locally with a `TOSHL_API_TOKEN` that reaches their real accounts,
transactions, and budgets.

## Architecture

```
src/index.ts          entry point
src/server/           MCP server wiring (resources + tools)
src/tools/            MCP tools — parameterized operations
src/resources/        MCP resources — direct data access
src/api/toshl-client.ts   HTTP client: auth, retries, ETag caching, error mapping
src/api/auth.ts       builds the Authorization header from TOSHL_API_TOKEN
src/api/endpoints/    one module per Toshl resource
src/utils/            logger (Winston), in-memory cache, error mapping, types
lib/toshl-api/        secondary client, partially included in the build
```

ES modules throughout — **imports of local files must carry the `.js` extension** even
in TypeScript (`import x from './foo.js'`). `NodeNext` resolution enforces it.

## Conventions

Style rules live in `.clinerules` and are load-bearing: 4-space indent, single quotes,
semicolons, arrow functions, `async`/`await`, PascalCase types, camelCase values.

- Errors map to MCP error codes via `src/utils/error-handler.ts`. Never let a raw axios
  error escape — its `config.headers` carries the auth token.
- Log through the Winston logger in `src/utils/logger.ts`. Never log headers, request
  configs, whole error objects, or anything derived from `process.env`.
- `process.env` is read in `src/api/auth.ts` and config loading. Keep it that way.

## Commands

```
yarn build                                                   # tsc — the real typecheck gate
yarn test --testPathIgnorePatterns "/node_modules/" "/tests/api/"   # credential-free suites
yarn test                                                    # ALL suites; needs a live token
yarn dev                                                     # ts-node
```

`tests/api/**` are **integration tests against the live Toshl API**. They fail without a
real `TOSHL_API_TOKEN` and, when they do run, they hit a real account. CI runs only the
credential-free suites; see `.github/workflows/ci.yml`. Mocking the HTTP layer in
`tests/api/**` is the highest-value outstanding test task.

## Security invariants

These are the properties that make this server safe to hand a stranger's bank credentials.
Breaking one is never a refactor detail — call it out explicitly in any change.

1. **`api.toshl.com` is the only host contacted at runtime.** No telemetry, no analytics,
   no error reporting, no update check.
2. **The token stays in memory.** Never written to disk, a log, a cache, an error message,
   or a tool response.
3. **No process execution and no dynamic evaluation.** No `child_process`, `eval`,
   `new Function`, or `vm`. This code runs unsandboxed on users' machines.
4. **Dependencies stay minimal and registry-pinned.** No install lifecycle scripts
   (`postinstall` and friends), no git/URL/aliased dependency specifiers.
5. **TLS verification is never relaxed.** No `rejectUnauthorized: false`, no `http://` base URL.
6. **Tool and resource descriptions are part of the security surface.** Their text is fed
   straight into the calling model's context. They describe; they never instruct the
   assistant, and they never carry hidden or invisible content.

The server is **not read-only**: `entry_create`, `entry_update`, `entry_delete`,
`entry_convert_to_transfer`, and `entry_manage` mutate live financial records via
`POST`/`PUT`/`DELETE` in `toshl-client.ts`. Any change that widens that mutation surface
deserves explicit discussion, and no tool description may claim to be read-only when it
is not.

## Contributions

Pull requests are reviewed automatically — see `.github/pr-review-policy.md` for what is
checked and `SECURITY.md` for the trust model. `.github/**` is the highest-sensitivity
path in the repo; changes there are reviewed by hand.
