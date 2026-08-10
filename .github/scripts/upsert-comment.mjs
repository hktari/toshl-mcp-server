#!/usr/bin/env node
/**
 * upsert-comment — post or update a single marker-identified PR comment.
 *
 * Both the PR guard and the Claude review comment on PRs as `github-actions[bot]`, so
 * `gh pr comment --edit-last` would make them overwrite each other. Each caller passes
 * its own hidden HTML marker instead, and only ever rewrites its own comment.
 *
 * It also exists so the Claude review workflow can publish a comment without being
 * granted `Bash(gh api:*)`, which would carry POST/PATCH/DELETE against every endpoint
 * in the repository. This script can do exactly one thing.
 *
 * Usage:
 *   node .github/scripts/upsert-comment.mjs --pr <n> --marker '<!-- id -->' --body-file <path>
 *
 * Requires GH_TOKEN (or GITHUB_TOKEN) and GITHUB_REPOSITORY in the environment.
 */

import { readFileSync } from "node:fs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const pr = arg("pr");
const marker = arg("marker");
const bodyFile = arg("body-file");
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!pr || !marker || !bodyFile || !repo || !token) {
  console.error(
    "usage: upsert-comment.mjs --pr <n> --marker '<!-- id -->' --body-file <path>\n" +
    "(GH_TOKEN and GITHUB_REPOSITORY must be set)",
  );
  process.exit(2);
}

if (!/^\d+$/.test(pr)) {
  console.error(`--pr must be a number, got: ${pr}`);
  process.exit(2);
}

let body = readFileSync(bodyFile, "utf8");
if (!body.includes(marker)) body = `${marker}\n${body}`;

// GitHub rejects comment bodies over 65536 characters.
const MAX = 65000;
if (body.length > MAX) {
  body = body.slice(0, MAX) + "\n\n_…truncated._";
}

const api = async (method, path, payload) => {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "toshl-mcp-server-upsert-comment",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
};

const existing = await api("GET", `/repos/${repo}/issues/${pr}/comments?per_page=100`);
const mine = existing.find((c) => typeof c.body === "string" && c.body.includes(marker));

if (mine) {
  await api("PATCH", `/repos/${repo}/issues/comments/${mine.id}`, { body });
  console.log(`Updated comment ${mine.id}`);
} else {
  const created = await api("POST", `/repos/${repo}/issues/${pr}/comments`, { body });
  console.log(`Created comment ${created.id}`);
}
