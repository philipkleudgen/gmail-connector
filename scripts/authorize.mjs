#!/usr/bin/env node
/**
 * authorize.mjs — sign a mailbox in once, store its refresh token locally.
 *
 * This is the single command that makes `scripts/send.mjs` work for a mailbox.
 * It runs the Google consent flow in your browser and writes the resulting
 * refresh token straight to ~/.config/gmail-cli/<label>.env (mode 0600) — no
 * copy-pasting tokens, no Vercel round-trip.
 *
 *   node scripts/authorize.mjs --account main
 *
 * Sign in as the mailbox you want (info@firma.de for "main"). The
 * script verifies which address you actually authorized and prints it.
 *
 * Optional: also (re-)register the mailbox on the deployed MCP connector, so
 * claude.ai sessions get gmail_send_email for it too:
 *
 *   node scripts/authorize.mjs --account main --vercel
 *
 * That merges the mailbox into the GMAIL_ACCOUNTS env var of
 * the linked Vercel project (production) and prints the connector URL to paste
 * into claude.ai. Requires the vercel CLI; falls back to `npx vercel`.
 *
 * Client ID/secret come from <repo>/.env.local (GMAIL_CLIENT_ID /
 * GMAIL_CLIENT_SECRET) unless passed as environment variables.
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

// Fail early and in plain language rather than with a syntax error deep in a
// dependency — beginners run whatever Node their Mac happens to have.
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  console.error(
    `Node.js ${process.versions.node} ist zu alt — gebraucht wird Version 20 oder neuer.\n` +
      "Aktuelle Version (LTS) hier laden: https://nodejs.org\n" +
      "Danach Terminal einmal schließen und neu öffnen."
  );
  process.exit(2);
}

// fileURLToPath, not URL.pathname — the repo lives under "Claude Code" and
// pathname would hand us the percent-encoded "Claude%20Code".
const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

// ------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const key = argv[i].slice(2);
  if (key === "vercel") args.vercel = true;
  else args[key] = argv[++i];
}

const label = args.account;
if (!label) {
  console.error("usage: node scripts/authorize.mjs --account <label> [--vercel]");
  process.exit(2);
}

// ------------------------------------------------------------ credentials
function fromEnvLocal(key) {
  const file = path.join(repo, ".env.local");
  if (!fs.existsSync(file)) return undefined;
  const m = fs.readFileSync(file, "utf8").match(new RegExp(`^${key}\\s*=\\s*"?(.*?)"?$`, "m"));
  return m ? m[1] : undefined;
}

/**
 * Ask on the terminal. Hidden input for secrets, so nothing lands in the
 * scrollback (or in an assistant's chat log).
 */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      rl._writeToOutput = function (s) {
        if (s.includes(question)) rl.output.write(question);
        else if (s.trim()) rl.output.write("*");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

/**
 * Google no longer lets you view a client secret after creation — the only copy
 * is the JSON offered in the "OAuth-Client erstellt" dialog, which lands in the
 * download folder as client_secret_*.json. Reading it beats asking anyone to
 * retype a 35-character secret.
 */
function fromClientJson(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  else {
    for (const dir of [path.join(os.homedir(), "Downloads"), repo, process.cwd()]) {
      if (!fs.existsSync(dir)) continue;
      const hits = fs
        .readdirSync(dir)
        .filter((f) => /^client_secret.*\.json$/i.test(f))
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      candidates.push(...hits);
    }
  }
  for (const file of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      const c = j.web ?? j.installed ?? j;
      if (c.client_id && c.client_secret) {
        console.log(`Zugangsdaten aus ${file} übernommen.`);
        return { id: c.client_id, secret: c.client_secret };
      }
    } catch {
      /* not a usable client json — try the next */
    }
  }
  return null;
}

let CLIENT_ID = process.env.GMAIL_CLIENT_ID || fromEnvLocal("GMAIL_CLIENT_ID");
let CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || fromEnvLocal("GMAIL_CLIENT_SECRET");

if (!CLIENT_ID || !CLIENT_SECRET) {
  const fromJson = fromClientJson(args["client-json"]);
  if (fromJson) {
    CLIENT_ID = fromJson.id;
    CLIENT_SECRET = fromJson.secret;
  }
}

// First run: no .env.local yet. Creating a dotfile by hand is the single most
// error-prone step for a beginner, so collect the two values here and write it.
if (!CLIENT_ID || !CLIENT_SECRET) {
  if (!process.stdin.isTTY) {
    console.error(
      "Es fehlen GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET, und ich kann hier nicht nachfragen.\n" +
        "Bitte diesen Befehl direkt im Terminal ausführen (nicht über ein Skript weiterleiten)."
    );
    process.exit(2);
  }
  console.log(
    "\nEinmalige Einrichtung. Am einfachsten geht es mit der JSON-Datei, die die\n" +
      "Console beim Erstellen des Clients zum Download angeboten hat: leg sie in den\n" +
      "Download-Ordner und starte diesen Befehl neu — dann entfällt jedes Tippen.\n" +
      "Alternativ die zwei Werte hier eingeben (Google Auth Platform → Clients).\n" +
      "Der Schlüssel wird beim Tippen nicht angezeigt.\n"
  );
  CLIENT_ID = CLIENT_ID || (await ask("Client-ID:      "));
  CLIENT_SECRET = CLIENT_SECRET || (await ask("Client-Schlüssel: ", { hidden: true }));

  if (!CLIENT_ID.endsWith(".apps.googleusercontent.com")) {
    console.error(
      "\nDas sieht nicht wie eine Client-ID aus — die endet immer auf\n" +
        "  .apps.googleusercontent.com\n" +
        "Bitte in der Google Cloud Console noch einmal kopieren und neu starten."
    );
    process.exit(2);
  }
  if (CLIENT_SECRET.length < 10) {
    console.error("\nDer Client-Schlüssel ist zu kurz — bitte noch einmal kopieren.");
    process.exit(2);
  }

  const envFile = path.join(repo, ".env.local");
  fs.writeFileSync(
    envFile,
    `GMAIL_CLIENT_ID=${CLIENT_ID}\nGMAIL_CLIENT_SECRET=${CLIENT_SECRET}\n`,
    { mode: 0o600 }
  );
  console.log(`\nGespeichert in ${envFile} — beim nächsten Mal wirst du nicht mehr gefragt.`);
}

/** macOS `open`, Windows `start`, Linux `xdg-open` — the script must not care. */
function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).unref();
  } catch {
    // No browser opener (headless box, WSL without wslu): the URL is printed
    // above, the user can paste it anywhere.
  }
}

const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

// ----------------------------------------------------------- consent flow
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith("/oauth2callback")) return res.writeHead(404).end();
    const url = new URL(req.url, REDIRECT_URI);
    const err = url.searchParams.get("error");
    if (err) {
      res.writeHead(400).end(`Authorization failed: ${err}`);
      server.close();
      return reject(new Error(err));
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      "<h2>Done — you can close this tab and go back to the terminal.</h2>"
    );
    server.close();
    resolve(url.searchParams.get("code"));
  });
  server.listen(PORT, () => {
    console.log(`\nSign in as the mailbox for "${label}". Opening browser…`);
    console.log(`If nothing opens, paste this URL yourself:\n\n${authUrl}\n`);
    openBrowser(authUrl);
  });
});

const { tokens } = await oauth2.getToken(code);
if (!tokens.refresh_token) {
  console.error(
    "Google returned no refresh token. Revoke the app under " +
      "https://myaccount.google.com/permissions and run this again."
  );
  process.exit(1);
}
oauth2.setCredentials(tokens);

// verify which mailbox was actually authorized
const gmail = google.gmail({ version: "v1", auth: oauth2 });
const { data: profile } = await gmail.users.getProfile({ userId: "me" });

// ------------------------------------------------------------ local store
const dir = path.join(os.homedir(), ".config", "gmail-cli");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `${label}.env`);
fs.writeFileSync(
  file,
  `# ${profile.emailAddress}\n` +
    `GMAIL_CLIENT_ID=${CLIENT_ID}\n` +
    `GMAIL_CLIENT_SECRET=${CLIENT_SECRET}\n` +
    `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`,
  { mode: 0o600 }
);

console.log(`\nauthorized: ${profile.emailAddress}`);
console.log(`wrote:      ${file}`);
console.log(`\nVerify with:\n  node scripts/send.mjs --account ${label} --whoami`);

// --------------------------------------------------- optional: connector
if (!args.vercel) process.exit(0);

/**
 * `vercel` is frequently missing from the PATH that Node inherits even when the
 * interactive shell has it, so resolve the absolute path first and keep npx as
 * a last resort.
 */
function vercelBin() {
  if (process.platform !== "win32") {
    const which = spawnSync("/bin/sh", ["-lc", "command -v vercel"], { encoding: "utf8" });
    const found = which.stdout?.trim();
    if (found) return [found, (a) => a, false];
  }
  // On Windows the binary is vercel.cmd, which spawnSync only finds via a shell.
  const probe = spawnSync("vercel", ["--version"], { encoding: "utf8", shell: true });
  if (probe.status === 0) return ["vercel", (a) => a, true];
  return ["npx", (a) => ["--yes", "vercel", ...a], process.platform === "win32"];
}

const [BIN, wrap, useShell] = vercelBin();

function vercel(cliArgs, opts = {}) {
  return spawnSync(BIN, wrap(cliArgs), {
    cwd: repo,
    encoding: "utf8",
    shell: useShell,
    ...opts,
  });
}

// NOTE: Vercel marks Production variables as "sensitive" by default, and
// sensitive variables come back EMPTY from `vercel env pull`. So this read can
// legitimately find nothing even though a value is set — other mailboxes in
// GMAIL_ACCOUNTS would then be dropped. Re-run authorize.mjs for each mailbox
// after a reset, or keep the value non-sensitive if you need to merge blindly.
const tmp = path.join(os.tmpdir(), `gmail-env-${process.pid}`);
let existing = [];
try {
  vercel(["env", "pull", tmp, "--environment=production", "--yes"], { stdio: "inherit" });
  const dump = fs.readFileSync(tmp, "utf8");
  const m = dump.match(/^GMAIL_ACCOUNTS="?(.*?)"?$/m);
  if (m && m[1].trim()) existing = JSON.parse(m[1].replace(/\\"/g, '"'));
  else console.log("(existing GMAIL_ACCOUNTS not readable — it is a sensitive variable)");
} catch {
  /* no previous value — start fresh */
} finally {
  fs.rmSync(tmp, { force: true });
}

const secret = crypto.randomBytes(24).toString("hex");
const merged = [
  ...existing.filter((a) => a.label !== label),
  { secret, refreshToken: tokens.refresh_token, label },
];

vercel(["env", "rm", "GMAIL_ACCOUNTS", "production", "--yes"], { stdio: "ignore" });
// --value, not stdin: `vercel env add NAME production < file` silently stores an
// empty value in non-interactive mode. That cost us a debugging round.
const add = vercel([
  "env",
  "add",
  "GMAIL_ACCOUNTS",
  "production",
  "--value",
  JSON.stringify(merged),
  "--yes",
]);
if (add.status !== 0) {
  console.error(add.stderr || "vercel env add failed");
  process.exit(1);
}

console.log("\nGMAIL_ACCOUNTS updated on Vercel (production).");
console.log("Redeploy so the new env is picked up:");
console.log("  vercel redeploy <deine-vercel-url>   (die Adresse aus dem Deployment in Teil G.2)");
console.log("\nThen paste this into claude.ai › Connectors › Add custom connector:");
console.log(`  https://<deine-vercel-url>/${secret}/mcp`);
console.log("(paste it, never type it — a dropped character gives a 404)");
