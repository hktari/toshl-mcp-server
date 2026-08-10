# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/hktari/toshl-mcp-server/security/advisories/new).
Please don't open a public issue for a vulnerability.

Include what an attacker gains, the affected version or commit, and steps to reproduce.
Expect a first response within a week.

## Threat model

This server holds a `TOSHL_API_TOKEN` — a bearer credential to someone's complete financial
picture: balances, every transaction, income, and budgets — and runs unsandboxed on their
machine. Its output is fed directly into an LLM's context, which may itself hold other
credentials and tools.

Toshl's own access to the user's banks is read-only, so **no code in this repository can
move money**. There is no payment path here. The exposure is data, plus the machine the
server runs on.

The consequences worth defending against, in order:

1. **Token or financial data exfiltration** — the token or account data reaching any host
   other than `api.toshl.com`. The highest-severity class by a wide margin: it hands an
   attacker a named individual's full financial history.
2. **Code execution on the user's machine** — via an install lifecycle script, a
   compromised dependency, or dynamic evaluation at runtime.
3. **Manipulation of the calling assistant** — instructions smuggled through MCP tool
   descriptions, resource descriptions, or returned data, steering the user's model into
   using *its* other tools on an attacker's behalf.
4. **Destruction of financial records** — this server writes and deletes, not only reads.
   It cannot cost the user money, but it can cost them bookkeeping they cannot recover.

The security invariants that follow from this are listed in [`CLAUDE.md`](CLAUDE.md).

## How pull requests are handled

Every PR, including from first-time contributors, is checked automatically. Nothing in a
PR can switch these off, because all three run from `master`, not from the PR:

| Check | What it does |
| --- | --- |
| [`pr-guard.yml`](.github/workflows/pr-guard.yml) | Mechanical patterns: install hooks, non-registry and aliased dependencies, lockfile registries, `child_process`/`eval`/`vm`, TLS downgrade, new outbound hosts, committed secrets, CI tampering. Plus GitHub dependency review. |
| [`claude-review.yml`](.github/workflows/claude-review.yml) | Claude reviews the diff against [`.github/pr-review-policy.md`](.github/pr-review-policy.md) and comments. It reads the diff as data; it cannot approve, merge, or push. |
| [`ci.yml`](.github/workflows/ci.yml) | Build, typecheck, and credential-free tests. The only workflow that executes PR code — deliberately with no secrets and a read-only token. |

**No automated check merges anything.** A green run means nothing obviously hostile was
found, not that the change is approved. A human merges.

Contributors: a red PR guard isn't an accusation. Reply on the PR explaining what the
flagged change is for, and it gets resolved by hand.

### For anyone editing `.github/`

The review workflows use `pull_request_target`, so they run with repository secrets
available. They are safe **only** because they never place PR code on the runner:

- checkout is pinned to `base.ref`, never `head.sha`/`head.ref`
- no install, no build, no test step in those jobs
- the diff is fetched through the API and read as text

Adding a build step, an install step, or a head checkout to either of those workflows
turns them into a remote code execution hole that hands the repository's secrets to
anyone who opens a PR. `ci.yml` is where PR code runs, and it must never gain a secret.

## Operational notes for users

- Keep `TOSHL_API_TOKEN` in your MCP client's environment configuration, not in a file
  inside a repository. `.env` is gitignored; keep it that way.
- Rotate the token at <https://toshl.com/app/#/settings/apps> if it is ever pasted into a
  chat, a log, or an issue.
- The tools named `entry_create`, `entry_update`, `entry_delete`,
  `entry_convert_to_transfer`, and `entry_manage` **change your Toshl records**. They
  cannot touch your bank — Toshl reads from it and never writes to it — but a deleted
  entry is gone. If you want the assistant to only read your finances, restrict which
  tools it may call in your MCP client's configuration.
