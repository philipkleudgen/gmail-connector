/**
 * creds.mjs — locate the OAuth credentials for one mailbox.
 *
 * Lookup order:
 *   1. ~/.config/gmail-cli/<account>.env
 *   2. <repo>/.env.local                     (legacy: the private mailbox)
 * Each file needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function findCreds(account) {
  const candidates = [];
  if (account) {
    candidates.push(path.join(os.homedir(), ".config", "gmail-cli", `${account}.env`));
  }
  // fileURLToPath, not URL.pathname — "Claude Code" would stay percent-encoded.
  candidates.push(path.resolve(fileURLToPath(new URL("..", import.meta.url)), ".env.local"));

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const env = {};
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
    if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
      return { env, file };
    }
  }
  return null;
}

export function credsError(account) {
  return (
    `No credentials found for account "${account ?? "(default)"}".\n` +
    `Expected ~/.config/gmail-cli/${account ?? "<account>"}.env with ` +
    `GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.\n` +
    `See scripts/authorize.mjs.`
  );
}

/** CLI convenience: load or exit with a readable message. */
export function loadCreds(account) {
  const found = findCreds(account);
  if (found) return found;
  console.error(credsError(account));
  process.exit(2);
}
