/**
 * mime.mjs — build RFC 2822 / MIME messages for the Gmail API.
 *
 * Shared by scripts/send.mjs (CLI) and scripts/mcp-local.mjs (stdio MCP
 * server) so there is exactly one place where attachment encoding lives.
 * Zero dependencies on purpose: the kit's base install is googleapis only.
 *
 * The remote connector in lib/ deliberately does NOT use this — it runs on
 * Vercel and cannot see the user's disk, so it stays plain-text only.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CRLF = "\r\n";

/**
 * Gmail refuses messages over 25 MB. The limit applies to the *encoded*
 * message, which is why we measure after base64 rather than on the raw file:
 * base64 costs about 37 % (4 bytes out of every 3, plus line breaks), so a
 * 20 MB PDF is already over.
 */
export const GMAIL_MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp4": "video/mp4",
};

export function guessMime(file) {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

// --------------------------------------------------------------- encoding
const isAscii = (s) => /^[\x20-\x7E]*$/.test(s);

/** RFC 2047 encoded-word — for header *values* like Subject. */
export function encodeHeader(value) {
  return isAscii(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * RFC 2231 percent-encoding — for header *parameters* like filename.
 * An encoded-word is not legal inside a parameter, so "Übersicht.pdf" needs
 * filename*=UTF-8''%C3%9Cbersicht.pdf, not =?UTF-8?B?...?=. Getting this
 * wrong is what makes umlaut filenames arrive mangled.
 */
function encodeRFC2231(value) {
  return Array.from(Buffer.from(value, "utf8"))
    .map((b) => {
      const c = String.fromCharCode(b);
      return /[A-Za-z0-9!#$&+\-.^_`|~]/.test(c)
        ? c
        : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
}

const quote = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Both forms of the filename: the RFC 2231 one that carries the real
 * characters, and a sanitised ASCII fallback for clients that ignore it.
 *
 * filename* MUST come first. Verified against Gmail on 2026-07-25 by sending
 * the four permutations to a real mailbox and reading back what was stored:
 * Gmail takes whichever filename parameter appears first and ignores the
 * other, so "Prüfbericht Größe.txt" arrives as "Pr_fbericht Gr__e.txt" if the
 * ASCII fallback leads. Folding the continuation onto the next line is fine.
 */
function dispositionHeader(name) {
  if (isAscii(name)) return `Content-Disposition: attachment; filename="${quote(name)}"`;
  const ascii = name.replace(/[^\x20-\x7E]/g, "_");
  return (
    `Content-Disposition: attachment; filename*=UTF-8''${encodeRFC2231(name)};` +
    `${CRLF} filename="${quote(ascii)}"`
  );
}

/** base64 in 76-character lines — some clients reject longer ones. */
function wrapBase64(buf) {
  const b64 = buf.toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

// ------------------------------------------------------------ attachments
function tooBig(bytes) {
  const mb = (bytes / 1024 / 1024).toFixed(1);
  const limit = (GMAIL_MAX_MESSAGE_BYTES / 1024 / 1024).toFixed(0);
  return new Error(
    `Message is ${mb} MB after base64 encoding, over Gmail's ${limit} MB limit. ` +
      `Base64 adds about 37 %, so the raw files must stay under roughly ` +
      `${(GMAIL_MAX_MESSAGE_BYTES / 1.37 / 1024 / 1024).toFixed(0)} MB in total. ` +
      `Upload the file to Google Drive and send a share link instead.`
  );
}

/**
 * Accepts either { path } (read from disk) or { filename, mimeType, base64 }
 * (inline bytes) and returns uniform { name, mime, data, size } records.
 *
 * Sizes are checked while reading so a 200 MB file is rejected on its stat,
 * not after it has been slurped into memory and base64'd.
 */
export function resolveAttachments(specs = []) {
  const out = [];
  let total = 0;

  for (const spec of specs) {
    let name, mime, data;

    if (spec.path) {
      const resolved = path.resolve(spec.path);
      let stat;
      try {
        stat = fs.statSync(resolved);
      } catch {
        throw new Error(`Attachment not found: ${resolved}`);
      }
      if (!stat.isFile()) throw new Error(`Attachment is not a file: ${resolved}`);
      total += Math.ceil(stat.size * 1.37);
      if (total > GMAIL_MAX_MESSAGE_BYTES) throw tooBig(total);
      name = spec.filename ?? path.basename(resolved);
      mime = spec.mimeType ?? guessMime(resolved);
      data = fs.readFileSync(resolved);
    } else if (spec.base64) {
      if (!spec.filename) throw new Error("Inline attachment needs a filename.");
      data = Buffer.from(spec.base64, "base64");
      if (!data.length) throw new Error(`Attachment "${spec.filename}" decoded to 0 bytes.`);
      total += Math.ceil(data.length * 1.37);
      if (total > GMAIL_MAX_MESSAGE_BYTES) throw tooBig(total);
      name = spec.filename;
      mime = spec.mimeType ?? guessMime(spec.filename);
    } else {
      throw new Error('Each attachment needs either "path" or "filename" + "base64".');
    }

    if (!data.length) throw new Error(`Attachment "${name}" is empty (0 bytes).`);
    out.push({ name, mime, data, size: data.length });
  }

  return out;
}

// ---------------------------------------------------------- message build
const boundary = (tag) => `${tag}_${crypto.randomBytes(12).toString("hex")}`;

/**
 * Build the full message source. `attachments` must already be resolved by
 * resolveAttachments(). Throws if the encoded result exceeds Gmail's limit.
 */
export function buildMime({ to, cc, bcc, subject, text, html, attachments = [], headers }) {
  const hasHtml = Boolean(html);
  const hasFiles = attachments.length > 0;

  const head = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${encodeHeader(subject ?? "")}`,
    "MIME-Version: 1.0",
    ...Object.entries(headers ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);

  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(text ?? "", "utf8")),
  ].join(CRLF);

  let bodyBlock = textPart;
  if (hasHtml) {
    const alt = boundary("alt");
    bodyBlock = [
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      textPart,
      `--${alt}`,
      [
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(Buffer.from(html, "utf8")),
      ].join(CRLF),
      `--${alt}--`,
    ].join(CRLF);
  }

  let raw;
  if (!hasFiles) {
    raw = [...head, bodyBlock].join(CRLF);
  } else {
    const mix = boundary("mix");
    const parts = [
      `Content-Type: multipart/mixed; boundary="${mix}"`,
      "",
      `--${mix}`,
      bodyBlock,
    ];
    for (const f of attachments) {
      parts.push(
        `--${mix}`,
        `Content-Type: ${f.mime}; name="${quote(f.name.replace(/[^\x20-\x7E]/g, "_"))}"`,
        "Content-Transfer-Encoding: base64",
        dispositionHeader(f.name),
        "",
        wrapBase64(f.data)
      );
    }
    parts.push(`--${mix}--`);
    raw = [...head, ...parts].join(CRLF);
  }

  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > GMAIL_MAX_MESSAGE_BYTES) throw tooBig(bytes);
  return raw;
}

/** Gmail's `raw` field wants base64url (- and _, no padding worries). */
export const toRaw = (mime) => Buffer.from(mime, "utf8").toString("base64url");
