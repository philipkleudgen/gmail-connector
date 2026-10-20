/**
 * Account registry: maps a URL-path secret to one Gmail account's refresh
 * token. Adding a mailbox = adding one entry here (via env), no code change.
 *
 * Two sources, merged:
 *   1. GMAIL_ACCOUNTS — a JSON array (the way to add new mailboxes):
 *        [{ "secret": "<hex>", "refreshToken": "<token>", "label": "main" }]
 *   2. Legacy single account — MCP_SECRET + GMAIL_REFRESH_TOKEN. Kept so the
 *      first connector keeps working without re-adding it in Claude.
 *
 * The shared OAuth client (GMAIL_CLIENT_ID/SECRET) is used for all accounts.
 */
export interface GmailAccount {
  secret: string;
  refreshToken: string;
  label?: string;
}

let cache: Map<string, GmailAccount> | null = null;

export function getAccounts(): Map<string, GmailAccount> {
  if (cache) return cache;
  const map = new Map<string, GmailAccount>();

  const raw = process.env.GMAIL_ACCOUNTS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<{
        secret?: string;
        refreshToken?: string;
        label?: string;
      }>;
      for (const a of parsed) {
        if (a?.secret && a?.refreshToken) {
          map.set(a.secret, {
            secret: a.secret,
            refreshToken: a.refreshToken,
            label: a.label,
          });
        }
      }
    } catch {
      // Malformed GMAIL_ACCOUNTS is ignored so one bad entry can't take the
      // whole server down; the legacy account below still resolves.
    }
  }

  const legacySecret = process.env.MCP_SECRET;
  const legacyToken = process.env.GMAIL_REFRESH_TOKEN;
  if (legacySecret && legacyToken && !map.has(legacySecret)) {
    map.set(legacySecret, {
      secret: legacySecret,
      refreshToken: legacyToken,
      label: "default",
    });
  }

  cache = map;
  return map;
}

export function resolveAccount(secret: string): GmailAccount | null {
  return getAccounts().get(secret) ?? null;
}
