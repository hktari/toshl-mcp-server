#!/usr/bin/env node
/**
 * pr-guard — deterministic pull request checks for toshl-mcp-server.
 *
 * Reads a unified diff and flags the change patterns that a hostile PR against this
 * project would need in order to steal a user's TOSHL_API_TOKEN, run code on their
 * machine, or subvert this repository's own CI.
 *
 * This is intentionally dumb and mechanical. It cannot be reasoned with, cannot be
 * talked out of firing by a persuasive PR description, and does not call a model.
 * It is the floor under the Claude review, not a replacement for it — it catches the
 * known shapes; Claude catches intent.
 *
 * It runs from the BASE branch (see pr-guard.yml) and only ever reads the diff as
 * text. It never checks out, installs, or executes pull request code.
 *
 * Usage:  node .github/scripts/pr-guard.mjs <path-to-diff>
 * Exit 0 = no blocking findings, exit 1 = at least one BLOCK (or the script failed,
 * which is also a failure — fail closed).
 */

import { readFileSync, appendFileSync } from "node:fs";

const BLOCK = "BLOCK";
const WARN = "WARN";

// ---------------------------------------------------------------------------
// Allowlists
// ---------------------------------------------------------------------------

/** The only hosts this project has any business contacting or linking to in code. */
const ALLOWED_HOSTS = new Set([
  "api.toshl.com",
  "toshl.com",
  "www.toshl.com",
  "developer.toshl.com",
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
  "api.github.com", // used by .github/scripts/upsert-comment.mjs
  "modelcontextprotocol.io",
  "spec.modelcontextprotocol.io",
  "json-schema.org",
  "nodejs.org",
  "opensource.org",
  "schema.org",
  "www.w3.org",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "example.com",
  "www.example.com",
]);

/** Registries a lockfile may legitimately resolve packages from. */
const ALLOWED_REGISTRY_HOSTS = new Set(["registry.yarnpkg.com", "registry.npmjs.org"]);

/** package.json keys whose values are URLs by design and are not dependencies. */
const NON_DEPENDENCY_KEYS = new Set([
  "repository", "homepage", "bugs", "url", "funding", "author", "license",
  "main", "module", "types", "typings", "bin", "man", "browser", "$schema",
  "description", "name", "version", "directory", "email",
]);

/** npm lifecycle hooks that execute on install, on the machine of whoever installs. */
const LIFECYCLE_HOOKS = [
  "preinstall", "install", "postinstall",
  "prepare", "prepublish", "prepublishOnly", "postpublish",
  "prepack", "postpack",
];

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|ya?ml|sh|bash)$/i;

/**
 * This file states the patterns it hunts for as literal strings, so scanning itself
 * flags every one of them. Changes to it are still surfaced loudly by checkRepoConfig
 * and reviewed by hand, and the version that actually runs always comes from the base
 * branch — so a PR's edits to it never take effect on that PR.
 */
const SELF = ".github/scripts/pr-guard.mjs";

/** Config paths that execute code or redirect where code comes from. */
const SENSITIVE_CONFIG = [
  ".npmrc", ".yarnrc", ".yarnrc.yml", ".mcp.json", ".claude.json",
  "CLAUDE.md", "REVIEW.md", ".gitmodules",
];
const SENSITIVE_PREFIXES = [".github/", ".claude/", ".husky/", ".vscode/"];

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff into per-file lists of added lines with their line numbers in
 * the post-change file. Only added lines matter: we are looking for what a PR
 * introduces, not what it removes.
 */
function parseDiff(diff) {
  /** @type {Map<string, {path: string, isNew: boolean, added: {n: number, text: string}[]}>} */
  const files = new Map();
  let current = null;
  let newLineNo = 0;

  for (const raw of diff.split("\n")) {
    const gitHeader = raw.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitHeader) {
      const path = gitHeader[2];
      current = files.get(path) ?? { path, isNew: false, added: [] };
      files.set(path, current);
      newLineNo = 0;
      continue;
    }
    if (!current) continue;

    if (raw.startsWith("new file mode")) {
      current.isNew = true;
      continue;
    }

    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLineNo = Number(hunk[1]);
      continue;
    }

    // Header lines, not content.
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;

    if (raw.startsWith("+")) {
      current.added.push({ n: newLineNo, text: raw.slice(1) });
      newLineNo++;
    } else if (raw.startsWith("-") || raw.startsWith("\\")) {
      // Removed line or "\ No newline at end of file": no new-file line consumed.
    } else {
      newLineNo++;
    }
  }
  return [...files.values()];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findings = [];
function report(severity, rule, file, line, message, evidence) {
  findings.push({ severity, rule, file, line, message, evidence: truncate(evidence, 160) });
}

function truncate(s, max) {
  if (!s) return "";
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

function basename(p) {
  return p.split("/").pop();
}

/** Shannon entropy in bits per character — used to separate real secrets from prose. */
function entropy(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const PLACEHOLDER = /^(your|my|the|xxx|x{4,}|\.{3}|<|\$\{|\{\{|example|changeme|change_me|dummy|placeholder|redacted|sample|test|fake|todo|insert|replace|abc|123|none|null|undefined|secret_here|token_here)/i;

function looksLikePlaceholder(value) {
  if (PLACEHOLDER.test(value)) return true;
  if (/_here$|_goes_here$|^<.*>$/i.test(value)) return true;
  // A single repeated character, or too few distinct characters to be a real key.
  if (new Set(value).size <= 4) return true;
  return false;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkManifest(file) {
  if (basename(file.path) !== "package.json") return;

  for (const { n, text } of file.added) {
    const entry = text.match(/^\s*"([^"]+)"\s*:\s*"([^"]*)"/);
    if (!entry) continue;
    const [, key, value] = entry;

    if (LIFECYCLE_HOOKS.includes(key)) {
      report(
        BLOCK, "install-hook", file.path, n,
        `Adds an npm \`${key}\` lifecycle script. This executes automatically on \`yarn install\` ` +
        `on every contributor's and user's machine — the most direct code-execution path into this project.`,
        text,
      );
      continue;
    }

    if (NON_DEPENDENCY_KEYS.has(key)) continue;

    if (/^(git\+|git:|ssh:|file:|link:|portal:|patch:|github:)/i.test(value) || /\.tgz($|\?)/i.test(value)) {
      report(
        BLOCK, "non-registry-dependency", file.path, n,
        `Dependency \`${key}\` resolves from outside the public npm registry. Its contents are not ` +
        `pinned by the registry and can change under a tag or branch without any diff here.`,
        text,
      );
    } else if (/^https?:/i.test(value)) {
      report(
        BLOCK, "non-registry-dependency", file.path, n,
        `Dependency \`${key}\` points at a URL rather than a semver range.`,
        text,
      );
    } else if (/^npm:/i.test(value)) {
      report(
        BLOCK, "aliased-dependency", file.path, n,
        `Dependency \`${key}\` is an npm alias, so the name in the manifest is not the package ` +
        `actually installed. This is how a familiar name gets pointed at hostile code.`,
        text,
      );
    }
  }
}

function checkLockfile(file) {
  const name = basename(file.path);
  if (name !== "yarn.lock" && name !== "package-lock.json") return;

  for (const { n, text } of file.added) {
    const resolved = text.match(/resolved"?\s*:?\s*"([^"]+)"/);
    if (!resolved) continue;
    const host = hostOf(resolved[1]);
    if (host && !ALLOWED_REGISTRY_HOSTS.has(host)) {
      report(
        BLOCK, "lockfile-foreign-registry", file.path, n,
        `Lockfile resolves a package from \`${host}\`, not the public npm registry.`,
        text,
      );
    }
  }
}

function checkDangerousApis(file) {
  if (file.path === SELF) return;
  if (!CODE_EXTENSIONS.test(file.path)) return;
  if (/^(tests?|__tests__)\//.test(file.path) || /\.(test|spec)\.[tj]sx?$/.test(file.path)) return;
  // JSON has no executable semantics, and vendored API schemas are full of English prose
  // that trips code patterns. package.json's one executable surface is its scripts block,
  // which checkManifest covers.
  if (/\.json$/i.test(file.path)) return;

  const rules = [
    [BLOCK, /(?:require\(\s*['"]|from\s+['"]|import\(\s*['"])(?:node:)?child_process['"]/,
      "Imports `child_process`. This server has no reason to start processes; it is a direct path to running arbitrary commands on the user's machine."],
    [BLOCK, /(?:require\(\s*['"]|from\s+['"]|import\(\s*['"])(?:node:)?vm['"]/,
      "Imports `vm`, which evaluates arbitrary code at runtime."],
    [BLOCK, /\bnew\s+Function\s*\(/,
      "Uses `new Function(...)`, which compiles a string into executable code."],
    [BLOCK, /(?<![.\w])eval\s*\(/,
      "Uses `eval(...)`, which executes a string as code."],
    // No `\s*` before the paren: `import (foo)` is legal JS but vanishingly rare, whereas
    // English prose like "was imported (via a bank sync)" matches it constantly.
    [WARN, /(?<![\w.])import\(\s*[^'")\s]/,
      "Uses a dynamic `import()` with a non-literal specifier — the module loaded depends on runtime data."],
    [WARN, /(?:require\(\s*['"]|from\s+['"])(?:node:)?(?:dns|net|tls|dgram|cluster|worker_threads)['"]/,
      "Imports a low-level network or concurrency module this project does not otherwise use."],
    [BLOCK, /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/,
      "Disables TLS certificate verification, which exposes the API token to interception."],
    [WARN, /\b__proto__\b|\[["']constructor["']\]|\bObject\.setPrototypeOf\s*\(/,
      "Touches the prototype chain — check for prototype pollution via API response or tool-argument keys."],
  ];

  for (const { n, text } of file.added) {
    for (const [severity, pattern, message] of rules) {
      if (pattern.test(text)) report(severity, "dangerous-api", file.path, n, message, text);
    }
  }
}

function checkEgress(file) {
  if (!CODE_EXTENSIONS.test(file.path)) return;
  // Lockfiles are full of `funding` URLs (opencollective, tidelift, project homepages)
  // that say nothing about what the code contacts. checkLockfile already covers the part
  // that matters there — which registry each package is actually resolved from.
  if (/(^|\/)(yarn\.lock|package-lock\.json|npm-shrinkwrap\.json)$/.test(file.path)) return;
  // `docs/` holds vendored Toshl API schemas and reference material full of spec links
  // (RFCs, openexchangerates, etc). Nothing there executes. Claude still reads docs for
  // malicious instructions, and checkSecrets still runs over them — that is where the
  // TOSHL_API_TOKEN in docs/api/*.md would have been caught.
  if (/^docs\//.test(file.path)) return;
  const isRuntime = /^(src|lib)\//.test(file.path);

  for (const { n, text } of file.added) {
    // `$` and `{` terminate the match so a template literal like
    // `https://example.com${path}` yields the host, not "example.com${path".
    for (const url of text.match(/https?:\/\/[^\s'"`<>)\]}{$,\\]+/gi) ?? []) {
      const host = hostOf(url);
      if (!host || ALLOWED_HOSTS.has(host)) continue;
      report(
        isRuntime ? BLOCK : WARN, "new-egress-host", file.path, n,
        `Introduces the host \`${host}\`${isRuntime ? " in runtime code" : ""}. The only host this ` +
        `server should contact is api.toshl.com; a new destination is how the token or a user's ` +
        `financial data leaves their machine.`,
        url,
      );
    }
  }
}

function checkSecrets(file) {
  if (file.path === SELF) return;
  const rules = [
    [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "a private key"],
    [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/, "a GitHub token"],
    [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "a GitHub fine-grained PAT"],
    [/\bsk-ant-[A-Za-z0-9\-_]{20,}\b/, "an Anthropic API key"],
    [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key ID"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "a Slack token"],
    [/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{20,}/, "a hardcoded Authorization header value"],
  ];

  for (const { n, text } of file.added) {
    for (const [pattern, what] of rules) {
      const m = text.match(pattern);
      if (m && !looksLikePlaceholder(m[0].replace(/^(Bearer|Basic)\s+/i, ""))) {
        report(BLOCK, "secret", file.path, n, `Looks like ${what} committed in plaintext.`, m[0]);
      }
    }

    // Generic `SOMETHING_TOKEN = <high entropy string>`. This is the rule that would have
    // caught the TOSHL_API_TOKEN that shipped in .env.example and docs/api/*.md.
    const assign = text.match(
      /\b(\w*(?:token|secret|password|passwd|api_?key|access_?key|auth|credential)\w*)\b\s*[:=]\s*["']?([A-Za-z0-9+/_=-]{24,})["']?/i,
    );
    if (assign) {
      const value = assign[2];
      if (!looksLikePlaceholder(value) && entropy(value) > 3.2) {
        report(
          BLOCK, "secret", file.path, n,
          `\`${assign[1]}\` is assigned a ${value.length}-character high-entropy value. If this is a ` +
          `real credential it is now public and must be revoked, not just deleted.`,
          `${assign[1]}=${value.slice(0, 6)}…`,
        );
      }
    }
  }
}

function checkRepoConfig(file) {
  const path = file.path;
  const isSensitive =
    SENSITIVE_CONFIG.includes(basename(path)) ||
    SENSITIVE_CONFIG.includes(path) ||
    SENSITIVE_PREFIXES.some((p) => path.startsWith(p));
  if (!isSensitive) return;

  report(
    WARN, "repo-config-change", path, file.added[0]?.n ?? 0,
    `Modifies repository tooling/CI configuration. Review this by hand before anything else in the ` +
    `PR: the workflows here hold CLAUDE_CODE_OAUTH_TOKEN, and the guard scripts and review policy ` +
    `are what this PR is being judged by.`,
    "",
  );

  // .npmrc/.yarnrc redirecting the registry replaces every dependency at once.
  if (/^\.(npm|yarn)rc/.test(basename(path))) {
    for (const { n, text } of file.added) {
      if (/registry\s*=|_auth|always-auth|npmRegistryServer/i.test(text)) {
        report(
          BLOCK, "registry-redirect", path, n,
          "Changes the package registry or its auth. This silently repoints every dependency install.",
          text,
        );
      }
    }
  }

  if (!path.startsWith(".github/workflows/")) return;
  for (const { n, text } of file.added) {
    if (/pull_request_target/.test(text)) {
      report(BLOCK, "workflow-privilege", path, n,
        "Adds a `pull_request_target` trigger, which runs with repository secrets available.", text);
    }
    if (/head\.sha|head\.ref|head_ref/.test(text)) {
      report(BLOCK, "workflow-privilege", path, n,
        "References the PR head ref in a workflow. Checking out PR head in a privileged job is the " +
        "classic pwn-request vulnerability.", text);
    }
    if (/\bsecrets\./.test(text)) {
      report(WARN, "workflow-privilege", path, n,
        "Introduces a secret reference into a workflow. Confirm the job it lands in never runs PR code.", text);
    }
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function render(files, blocking, warning, truncated) {
  const out = ["<!-- pr-guard -->", "## 🛡️ PR guard", ""];

  if (truncated) {
    out.push(
      `> ⚠️ The diff exceeded the size cap and was analyzed only in part. Treat a clean result as ` +
      `inconclusive and review this PR by hand.`, "",
    );
  }

  if (!blocking.length && !warning.length) {
    out.push(
      `✅ No blocking patterns found across ${files.length} changed file${files.length === 1 ? "" : "s"}.`,
      "",
      "Checked: install hooks · non-registry and aliased dependencies · lockfile registries · " +
      "`child_process`/`eval`/`vm` · TLS downgrade · new outbound hosts · committed secrets · " +
      "CI, `.npmrc`, and review-policy tampering.",
      "",
      "_This is a pattern check, not a judgement. The Claude review covers intent._",
    );
    return out.join("\n");
  }

  const section = (title, items, note) => {
    if (!items.length) return;
    out.push(`### ${title}`, "");
    if (note) out.push(note, "");
    for (const f of items) {
      const more = f.repeats > 1 ? ` _(+${f.repeats - 1} more occurrence${f.repeats > 2 ? "s" : ""})_` : "";
      out.push(`- **\`${f.file}\`${f.line ? `:${f.line}` : ""}**${more} — ${f.message}`);
      if (f.evidence) out.push(`  \`\`\`\n  ${f.evidence}\n  \`\`\``);
      out.push(`  <sub>rule: \`${f.rule}\`</sub>`);
    }
    out.push("");
  };

  section("🔴 Blocking", blocking,
    "These are the patterns a PR would need in order to exfiltrate the Toshl token, run code on a " +
    "user's machine, or subvert this repo's CI. **Do not merge** until each one is explained.");
  section("🟡 Worth a look", warning,
    "Not conclusive on their own, but each is a step on one of those paths.");

  out.push(
    "---",
    "",
    "_Mechanical pattern check — [`.github/scripts/pr-guard.mjs`](../blob/master/.github/scripts/pr-guard.mjs), " +
    "run from `master`. It cannot be disabled by anything in this PR._",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const diffPath = process.argv[2];
if (!diffPath) {
  console.error("usage: pr-guard.mjs <path-to-diff>");
  process.exit(1);
}

const MAX_DIFF_BYTES = 8 * 1024 * 1024;
let diff = readFileSync(diffPath, "utf8");
const truncated = diff.length > MAX_DIFF_BYTES;
if (truncated) diff = diff.slice(0, MAX_DIFF_BYTES);

const files = parseDiff(diff);
for (const file of files) {
  checkManifest(file);
  checkLockfile(file);
  checkDangerousApis(file);
  checkEgress(file);
  checkSecrets(file);
  checkRepoConfig(file);
}

// A lockfile moving without its manifest is how an unnoticed dependency swap arrives.
const touched = new Set(files.map((f) => f.path));
if (touched.has("yarn.lock") && !touched.has("package.json")) {
  report(
    WARN, "lockfile-drift", "yarn.lock", 0,
    "yarn.lock changed without a corresponding package.json change. Confirm every moved entry is a " +
    "transitive resolution and not a swapped package.",
    "",
  );
}

// One repeated pattern across forty lines is one problem, not forty. Collapse identical
// findings so a genuine second issue is not buried under the first one's repeats.
const collapsed = new Map();
for (const f of findings) {
  const key = `${f.severity}|${f.rule}|${f.file}|${f.message}`;
  const seen = collapsed.get(key);
  if (seen) seen.repeats++;
  else collapsed.set(key, { ...f, repeats: 1 });
}

const order = { [BLOCK]: 0, [WARN]: 1 };
const unique = [...collapsed.values()].sort(
  (a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
);
const blocking = unique.filter((f) => f.severity === BLOCK);
const warning = unique.filter((f) => f.severity === WARN);

const report_md = render(files, blocking, warning, truncated);
console.log(report_md);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report_md + "\n");
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `blocking=${blocking.length}\nwarning=${warning.length}\n`,
  );
}

process.exit(blocking.length > 0 ? 1 : 0);
