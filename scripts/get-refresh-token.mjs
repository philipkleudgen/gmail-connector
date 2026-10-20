#!/usr/bin/env node
/**
 * One-time helper to obtain a long-lived Gmail refresh token for the SECOND
 * Google account. Runs entirely on your machine — no credentials leave it.
 *
 * Prerequisites (Google Cloud Console, see README.md):
 *   1. A project with the Gmail API enabled.
 *   2. An OAuth 2.0 Client ID of type "Web application".
 *   3. Authorized redirect URI: http://localhost:5555/oauth2callback
 *
 * Usage:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/get-refresh-token.mjs
 *
 * Then sign in with the SECOND account, approve, and copy the printed
 * refresh token into Vercel as GMAIL_REFRESH_TOKEN.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { google } from "googleapis";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", // read + labels + drafts
  "https://www.googleapis.com/auth/gmail.send", // send
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "\nERROR: set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET as environment variables.\n" +
      "Example:\n  GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run get-token\n"
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline", // request a refresh token
  prompt: "consent", // force consent so a refresh token is always returned
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith("/oauth2callback")) {
    res.writeHead(404).end("Not found");
    return;
  }
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400).end(`Authorization failed: ${error}`);
    console.error(`\nAuthorization failed: ${error}\n`);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400).end("Missing authorization code");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(
        "<h2>Done. You can close this tab and return to the terminal.</h2>"
      );

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh token returned. Remove this app's access at " +
          "https://myaccount.google.com/permissions and run the script again.\n"
      );
      server.close();
      process.exit(1);
    }

    // Persist the refresh token into .env.local (gitignored) rather than
    // printing it, so the long-lived credential stays out of terminal logs.
    const { appendFileSync, readFileSync, writeFileSync, existsSync } = await import(
      "node:fs"
    );
    const envPath = new URL("../.env.local", import.meta.url);
    let env = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    const line = `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`;
    if (/^GMAIL_REFRESH_TOKEN=.*$/m.test(env)) {
      env = env.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line);
      writeFileSync(envPath, env);
    } else {
      appendFileSync(envPath, (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n");
    }
    console.log(
      "\nSUCCESS — refresh token saved to .env.local (GMAIL_REFRESH_TOKEN). " +
        `Length: ${tokens.refresh_token.length} chars.\n`
    );
  } catch (e) {
    console.error("\nToken exchange failed:", e?.message || e, "\n");
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log(`\nOpen this URL and sign in with the SECOND Google account:\n`);
  console.log(authUrl + "\n");
  // Best-effort: open the browser automatically on macOS.
  spawn("open", [authUrl], { stdio: "ignore" }).on("error", () => {});
});
