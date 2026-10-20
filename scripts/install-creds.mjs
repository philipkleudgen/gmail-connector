#!/usr/bin/env node
/**
 * install-creds.mjs — one-off setup for scripts/send.mjs.
 *
 * Takes the OAuth credentials that already power the deployed MCP connector and
 * writes them to ~/.config/gmail-cli/<label>.env (mode 0600), one file per
 * mailbox. No new Google consent flow: same client, same refresh tokens.
 *
 *   node scripts/install-creds.mjs                 # pulls from Vercel itself
 *   node scripts/install-creds.mjs /tmp/e.env      # uses an env dump you pulled
 *
 * Secret values are never printed — only labels and target paths.
 *
 * Prefer scripts/authorize.mjs when a mailbox has no refresh token yet (or when
 * GMAIL_ACCOUNTS on Vercel is empty): it does the consent flow and writes the
 * same files, without needing the vercel CLI at all.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname — "Claude Code" would stay percent-encoded.
const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmp = path.join(os.tmpdir(), `gmail-env-${process.pid}`);

function val(text, key) {
  const m = text.match(new RegExp(`^${key}="?(.*?)"?$`, "m"));
  return m ? m[1] : null;
}

/** `vercel` is often only on the interactive shell's PATH — fall back to npx. */
function pullEnv(target) {
  const attempts = [
    ["vercel", ["env", "pull", target, "--environment=production", "--yes"]],
    ["npx", ["--yes", "vercel", "env", "pull", target, "--environment=production", "--yes"]],
  ];
  for (const [bin, argv] of attempts) {
    // shell:true on Windows — the binary is vercel.cmd and is otherwise not found.
    const r = spawnSync(bin, argv, {
      cwd: repo,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.error?.code === "ENOENT") continue;
    if (r.status === 0) return;
    process.exit(r.status ?? 1);
  }
  console.error(
    "vercel CLI not found (tried `vercel` and `npx vercel`).\n" +
      "Pull the env yourself and pass the file:\n" +
      "  vercel env pull /tmp/e.env --environment=production --yes\n" +
      "  node scripts/install-creds.mjs /tmp/e.env"
  );
  process.exit(1);
}

const supplied = process.argv[2];
let text;
if (supplied) {
  text = fs.readFileSync(supplied, "utf8");
} else {
  try {
    pullEnv(tmp);
    text = fs.readFileSync(tmp, "utf8");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const clientId = val(text, "GMAIL_CLIENT_ID");
const clientSecret = val(text, "GMAIL_CLIENT_SECRET");
if (!clientId || !clientSecret) {
  console.error("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET missing in the Vercel env.");
  process.exit(1);
}

const dir = path.join(os.homedir(), ".config", "gmail-cli");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

function write(label, refreshToken) {
  const file = path.join(dir, `${label}.env`);
  fs.writeFileSync(
    file,
    `GMAIL_CLIENT_ID=${clientId}\nGMAIL_CLIENT_SECRET=${clientSecret}\nGMAIL_REFRESH_TOKEN=${refreshToken}\n`,
    { mode: 0o600 }
  );
  console.log(`  wrote ${file}`);
}

const accounts = val(text, "GMAIL_ACCOUNTS");
if (accounts && accounts.trim()) {
  for (const a of JSON.parse(accounts.replace(/\\"/g, '"'))) {
    write(a.label ?? "account", a.refreshToken);
  }
} else {
  console.log("  GMAIL_ACCOUNTS is empty — no extra mailboxes registered.");
  console.log("  Add one with: node scripts/authorize.mjs --account <label> --vercel");
}

const legacy = val(text, "GMAIL_REFRESH_TOKEN");
if (legacy) write("privat", legacy);

console.log("\nDone. Verify with:");
console.log("  node scripts/send.mjs --account main --whoami");
