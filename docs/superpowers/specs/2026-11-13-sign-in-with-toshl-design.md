# Sign in with Toshl: one hosted server for many users

## Why

Claude's own personal finance feature (5 Nov 2026) is US-only. Toshl users in Europe can get the same
conversation through this server, but today it serves one person: one `TOSHL_API_TOKEN`, approved with a
passphrase. A non-technical user can't create a personal token, host a server or set a passphrase.

Goal: a person with a Toshl account adds one URL as a connector in Claude, clicks **Connect**, signs in
to Toshl, approves, and is done. No token, no passphrase, no server of their own.

## Goals

- Many users on one hosted instance, each seeing only their own Toshl data.
- Sign-in is Toshl's own OAuth 2.0 screen, chained inside the OAuth flow Claude already runs against us.
- Fail closed: no request ever runs with another user's token, a shared token, or a shared cache entry.
- Single-user mode (personal token, passphrase) keeps working unchanged.

## Non-goals (this MVP)

- ChatGPT. Its connectors use dynamic client registration and only Business/Enterprise/Edu can add a custom
  one; that comes after Claude works.
- A sign-up or billing page of our own. Toshl's authorize screen handles login; affiliate links come later.
- Listing in Claude's connector directory (needs a privacy policy, support contact and review).

## Anti-goals

- Storing Toshl tokens in plain text, or in logs.
- A fallback to `TOSHL_API_TOKEN` when the per-user token is missing.

## Approaches considered

1. **Chain Toshl's OAuth inside ours (picked).** `/oauth/authorize` redirects to `toshl.com/oauth2/authorize`;
   our callback exchanges the code, stores the user's Toshl tokens encrypted, and only then issues our own
   code to Claude. Claude keeps talking to the authorization server it already knows; nothing changes on its side.
2. **Pass Toshl's tokens straight through to Claude.** Simpler on paper, but Claude would hold Toshl
   tokens, Toshl's token endpoint wants a client secret Claude can't hold, and Toshl access tokens expire hourly.
3. **Ask users to paste a personal token on our sign-in page.** Works today with no Toshl approval, but it is
   exactly the friction we're removing.

## Design

- **Mode.** `TOSHL_OAUTH_CLIENT_ID` + `TOSHL_OAUTH_CLIENT_SECRET` switch the OAuth server to Toshl sign-in.
  The passphrase is then not used, and `TOSHL_API_TOKEN` must be unset (start-up refuses both).
- **Consent.** `GET /oauth/authorize` shows our own one-click page ("Claude is asking for access to your Toshl
  data… Continue to Toshl / Cancel"), a signed form posted back same-origin. Without it, a link to an authorize
  URL started in someone else's Claude could connect that Claude to the visitor's Toshl in one click whenever
  Toshl re-approves an app silently (found in review; the MCP guidance asks proxies for this step).
- **Authorize.** After consent, a random `state` (Toshl truncates state at 255 characters,
  so the pending request stays server-side, 10 minutes) is bound to the browser with a `__Host-` cookie and the
  user goes to Toshl. Redirect URI: `<MCP_PUBLIC_URL>/oauth/toshl/callback`. No `scope` is sent, so Toshl
  uses the scopes set when the app was registered.
- **Callback.** Checks state and cookie, exchanges the code at once (Toshl codes live 30 s), reads `/me` for
  the user id, stores `{access, refresh, expiry}` under that id, and issues our code with `sub = <toshl user id>`.
- **Token store.** `<stateDir>/toshl-tokens.json`, each record AES-256-GCM encrypted with a key derived from
  `MCP_OAUTH_SIGNING_KEY`, the user id as authenticated data (a record copied under another id won't open).
  Only the changed record is re-encrypted on a write. Records under the previous key are re-encrypted at
  start-up. A refresh that finishes after the user signed in again doesn't overwrite the newer tokens.
  Atomic writes, like the refresh store.
- **Known gap.** Disconnecting in Claude revokes our refresh token but leaves the user's Toshl tokens stored;
  they stop being usable for Claude and are dropped on the next Toshl `invalid_grant`. Deleting them on
  revoke (and revoking at Toshl) is a follow-up.
- **Requests.** `/mcp` reads `sub` from our access token. A session is bound to the `sub` that opened it; another
  user's token on that session id gets 404. The request runs inside an `AsyncLocalStorage` context; the API
  client takes the user's Toshl token from there (refreshing it a minute before expiry, one refresh in flight
  per user) and prefixes every cache key with the user id. With no context in this mode it throws.
- **Revoked at Toshl.** A refresh answered with `invalid_grant` deletes the stored tokens; `/mcp` then answers
  401 with the OAuth challenge, so Claude asks the user to connect again.

## Left to the builder

- Registering the Toshl app (redirect URI above) is Boštjan's step; other users need Toshl's approval.
- Hosting (Railway or similar, with a persistent volume for `MCP_OAUTH_STATE_DIR`).
