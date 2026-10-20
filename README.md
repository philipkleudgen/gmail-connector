# Gmail Second Account — MCP Connector

A private, EU-hosted **remote MCP server** that exposes a **second Gmail account**
to Claude as a custom connector. Once added to your Anthropic account it is
available in **both** the normal Claude apps **and Claude Cowork** (connectors are
account-level).

Built because the built-in Gmail connector only supports **one** Google account.

## Two surfaces, and why

| | `lib/` — remote connector | `scripts/mcp-local.mjs` — local server |
|---|---|---|
| Runs on | Vercel (fra1) | this machine, over stdio |
| Reachable from | any Claude client, incl. phone | Claude Code / Desktop on this machine |
| Attachments | **no** — see below | **yes**, `attachments: [{ path }]` |

The remote connector cannot do file attachments and is not going to: it runs in
a serverless function that cannot see your disk, so a `path` would resolve
against Vercel's filesystem, not yours. Pushing the bytes up as base64 instead
means a 277 KB PDF becomes ~370 KB of base64 inside the tool call — roughly
100k tokens for one attachment. The local server exists precisely to avoid
that: it reads the file from disk and only the message id comes back.

## Remote connector tools (8)

| Tool | Purpose |
|------|---------|
| `gmail_get_profile` | Show which account is connected + mailbox totals |
| `gmail_search_threads` | Search with Gmail query syntax |
| `gmail_get_thread` | Read a full thread (decoded bodies) |
| `gmail_get_message` | Read a single message |
| `gmail_list_labels` | List labels + ids |
| `gmail_modify_labels` | Add/remove labels (mark read, archive, label) |
| `gmail_create_draft` | Create a draft (optionally as a reply) |
| `gmail_send_email` | Send an email (Claude confirms first) |

## Local MCP server (7 tools, attachments included)

`scripts/mcp-local.mjs` speaks MCP over stdio and binds to one mailbox. Register
it with Claude Code:

```bash
claude mcp add gmail-local -- node /full/path/to/scripts/mcp-local.mjs --account main
```

…or in Claude Desktop's `claude_desktop_config.json`:

```json
"gmail-local": {
  "command": "node",
  "args": ["/full/path/to/scripts/mcp-local.mjs", "--account", "main"]
}
```

It offers `gmail_get_profile`, `gmail_search_threads`, `gmail_get_thread`,
`gmail_get_message`, `gmail_download_attachment`, `gmail_create_draft` and
`gmail_send_email`. The last two take an `attachments` array:

```jsonc
// preferred — read from disk, nothing large travels through the tool call
{ "attachments": [{ "path": "/Users/me/Documents/vertrag.pdf" }] }

// for content generated in memory
{ "attachments": [{ "filename": "notiz.txt", "mimeType": "text/plain", "base64": "…" }] }
```

> **After changing the tools, reload the MCP server.** Claude caches the tool
> schema from the last handshake, so an already-running client keeps showing the
> old parameter list and will insist `attachments` does not exist. In Claude
> Code: `claude mcp remove gmail-local` + re-add, or restart the session. In
> Claude Desktop: quit and reopen the app. This is the single most likely reason
> a change here looks like it did nothing.

The JSON-RPC framing is hand-rolled rather than taken from
`@modelcontextprotocol/sdk`: the SDK pulls express, hono and jose (~5.7 MB), and
the client kit's base install is deliberately `googleapis` only.

### MIME details

`scripts/mime.mjs` is shared by the local server and `scripts/send.mjs`, so
attachment encoding lives in exactly one place: `multipart/mixed`, CRLF line
endings, base64 wrapped at 76 characters, `base64url` for Gmail's `raw` field,
RFC 2047 for the subject and RFC 2231 for filenames.

One non-obvious bit, verified against a real mailbox rather than assumed:
**`filename*` must precede the ASCII `filename` fallback** in
`Content-Disposition`. Gmail takes whichever filename parameter comes first and
ignores the other, so with the fallback leading, `Prüfbericht Größe.txt` is
stored as `Pr_fbericht Gr__e.txt`. Parameter order matters; header folding does
not.

Messages over Gmail's 25 MB limit are rejected before the API call with a
message pointing at the Drive-link route. Base64 adds ~37 %, so the raw files
have to stay under roughly 18 MB in total.

Attachments need **no extra OAuth scope** — `gmail.send` covers them, since an
attachment is just part of the message body. Confirmed by sending one on a
project holding only `gmail.modify` + `gmail.send`.

## Architecture

- **Next.js 15 App Router** route handler at `app/[transport]/route.ts`, served by
  [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) (Streamable HTTP).
- Deployed on **Vercel, region `fra1` (Frankfurt)** — GDPR-friendly.
- **Gmail access**: server-side OAuth refresh token for the second account
  (`googleapis`). No interactive login at request time.
- **Endpoint auth**: a shared secret (`MCP_SECRET`) carried **in the URL path**
  (`/<secret>/mcp`). Claude's custom-connector flow drops the query string but
  keeps the path, so a 200 on the secret path lets it connect without forcing an
  OAuth handshake; a wrong/missing secret returns 404. Single-user, no OAuth
  server. Route: `app/[secret]/[transport]/route.ts`.

---

## Setup

### 1. Google Cloud (one time — you do this; never share the secret with anyone)

1. Go to <https://console.cloud.google.com/> signed in as the **second** account
   (or any account that may own the project).
2. **Create a project** (e.g. `gmail-mcp`).
3. **Enable the Gmail API**: APIs & Services → Library → search "Gmail API" → Enable.
4. **OAuth consent screen**:
   - If the second account is a **Google Workspace** account and you own the org:
     choose **User type = Internal**. ✅ Best option — refresh tokens never expire.
   - If it is a normal **@gmail.com**: choose **External**, fill the required
     fields, add the second account's email under **Test users**, then **PUBLISH
     the app** (set Publishing status to **In production**). ⚠️ Important: in
     "Testing" mode refresh tokens **expire after 7 days**. Publishing to
     production keeps them alive. You may see an "unverified app" warning during
     consent — that's expected for your own private app; click through
     (Advanced → Go to … ).
5. **Credentials** → Create Credentials → **OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URI**: `http://localhost:5555/oauth2callback`
   - Save the **Client ID** and **Client secret**.

### 2. Get a refresh token (one time — local, nothing leaves your machine)

```bash
cd gmail-connector
npm install
GMAIL_CLIENT_ID="<client id>" GMAIL_CLIENT_SECRET="<client secret>" npm run get-token
```

A browser opens. **Sign in with the SECOND account**, approve the scopes. The
terminal prints a refresh token — copy it.

### 3. Deploy to Vercel (region fra1)

```bash
vercel link        # create/link the project
vercel --prod      # first production deploy
```

Set environment variables (Vercel dashboard → Project → Settings → Environment
Variables, or CLI):

```bash
vercel env add GMAIL_CLIENT_ID production
vercel env add GMAIL_CLIENT_SECRET production
vercel env add GMAIL_REFRESH_TOKEN production
vercel env add MCP_SECRET production      # generate: openssl rand -hex 32
vercel --prod                              # redeploy so envs take effect
```

The region is pinned to `fra1` via `preferredRegion` in the route handler.

### 4. Add the custom connector in Claude

1. claude.ai (or Desktop) → Settings → Connectors → **+ → Add custom connector**.
2. **URL**: `https://<your-deployment>.vercel.app/<MCP_SECRET>/mcp`
   - ⚠️ Paste the URL (or set it via DOM) — typing it risks dropping a
     character in the long secret, which yields a 404 and a misleading
     "registration failed / add an OAuth client" error in Claude.
3. Click **Connect**. It connects directly (no OAuth prompt). Ask Claude:
   *"Use gmail_get_profile"* — it should return the second account's email.

---

## Add another mailbox (multi-account)

One deployment serves any number of mailboxes — no code change. To add e.g. the
second mailbox:

1. **Refresh token** for the new account:
   ```bash
   GMAIL_CLIENT_ID=.. GMAIL_CLIENT_SECRET=.. npm run get-token
   ```
   Sign in as the **new** account, approve. (Note: the new account is added to
   the OAuth app automatically since it's published to production. A Workspace
   account whose admin blocks unverified third-party apps may need an admin
   allow — handle if it comes up.)
2. **New path secret**: `openssl rand -hex 32`.
3. Append the account to the `GMAIL_ACCOUNTS` env var (JSON array) in Vercel:
   ```json
   [{"secret":"<new-hex-secret>","refreshToken":"<new-token>","label":"main"}]
   ```
   `vercel env rm GMAIL_ACCOUNTS production` then `vercel env add ...`, redeploy.
4. Add a **new custom connector** in Claude with URL
   `https://<your-deployment>.vercel.app/<new-hex-secret>/mcp` (paste, don't
   type). It appears as its own connector, separate from the first mailbox.

Account #1 stays on the legacy `MCP_SECRET` + `GMAIL_REFRESH_TOKEN` vars; both
forms are read (see `lib/accounts.ts`).

## Local development

```bash
npm install
npm run build
# .env.local holds GMAIL_* + MCP_SECRET
set -a && . ./.env.local && set +a && npx next start -p 3030
# in another shell (hits /<secret>/mcp, expects 404 on a wrong secret):
BASE=http://localhost:3030 MCP_SECRET=$MCP_SECRET node scripts/smoke-test.mjs
```

## Security notes

- The `MCP_SECRET` is the only thing protecting the mailbox endpoint. Treat the
  full connector URL as a password. Rotate by changing `MCP_SECRET` in Vercel and
  updating the connector URL.
- Scopes are limited to `gmail.modify` + `gmail.send` (read, label, draft, send).
  **No delete scope** is requested.
- To revoke everything: remove the app at
  <https://myaccount.google.com/permissions> and delete the Vercel env vars.

## Upgrade path

For stronger auth, replace the shared secret with a proper OAuth flow (the
`mcp-handler` `withMcpAuth` helper + an authorization server). Not needed for
single-user personal use.
