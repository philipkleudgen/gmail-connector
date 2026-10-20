import { google, gmail_v1 } from "googleapis";

/**
 * Gmail client for ONE connected Google account, identified by its refresh
 * token. One shared OAuth client (GMAIL_CLIENT_ID/SECRET) can serve any number
 * of accounts — each account has consented separately and has its own refresh
 * token. Clients are cached per refresh token.
 *
 * google-auth-library transparently exchanges the refresh token for short-lived
 * access tokens, so no interactive login happens at request time.
 */

const clientCache = new Map<string, gmail_v1.Gmail>();

export function getGmailClient(refreshToken: string): gmail_v1.Gmail {
  const cached = clientCache.get(refreshToken);
  if (cached) return cached;

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail OAuth client is not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET."
    );
  }
  if (!refreshToken) {
    throw new Error("No refresh token for this account.");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  clientCache.set(refreshToken, gmail);
  return gmail;
}

// ---------------------------------------------------------------------------
// Header / body helpers
// ---------------------------------------------------------------------------

export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const match = headers.find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase()
  );
  return match?.value || "";
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/**
 * Walk a message payload and extract the best-effort plain-text body.
 * Prefers text/plain; falls back to a stripped text/html.
 */
export function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return "";

  const plain = findPart(payload, "text/plain");
  if (plain) return plain;

  const html = findPart(payload, "text/html");
  if (html) return stripHtml(html);

  // Single-part message with the body directly on the payload.
  if (payload.body?.data) return decodeBase64Url(payload.body.data);

  return "";
}

function findPart(
  part: gmail_v1.Schema$MessagePart,
  mimeType: string
): string | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const found = findPart(child, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|br|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// RFC 2822 message building (for drafts + sending)
// ---------------------------------------------------------------------------

export interface OutgoingMessage {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** Message-ID of the message being replied to, for proper threading. */
  inReplyTo?: string;
  references?: string;
}

/** Encode a non-ASCII header value per RFC 2047 (UTF-8, base64). */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export function buildRawMessage(msg: OutgoingMessage): string {
  const headers: string[] = [];
  headers.push(`To: ${msg.to}`);
  if (msg.cc) headers.push(`Cc: ${msg.cc}`);
  if (msg.bcc) headers.push(`Bcc: ${msg.bcc}`);
  headers.push(`Subject: ${encodeHeaderValue(msg.subject)}`);
  if (msg.inReplyTo) headers.push(`In-Reply-To: ${msg.inReplyTo}`);
  if (msg.references) headers.push(`References: ${msg.references}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");

  const bodyBase64 = Buffer.from(msg.body, "utf-8").toString("base64");
  const raw = `${headers.join("\r\n")}\r\n\r\n${bodyBase64}`;
  return Buffer.from(raw, "utf-8").toString("base64url");
}
