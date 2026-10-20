#!/usr/bin/env node
/**
 * mcp-local.mjs — MCP server for one Gmail mailbox, over stdio, on this machine.
 *
 * Why this exists next to the remote connector in lib/: the remote one runs on
 * Vercel and cannot see your disk, so it can only send plain text. This one
 * runs locally, which is what makes `attachments: [{ path }]` possible — the
 * file is read from disk and never travels through the tool call as base64.
 *
 * The JSON-RPC framing is hand-rolled rather than taken from
 * @modelcontextprotocol/sdk on purpose: the SDK pulls in express, hono and jose
 * (~5.7 MB), and the client kit's base install is deliberately googleapis only.
 * The stdio surface an MCP client needs is small enough to spell out.
 *
 * Register it with Claude Code:
 *   claude mcp add gmail-local -- node /pfad/zu/scripts/mcp-local.mjs --account main
 *
 * Or in Claude Desktop's claude_desktop_config.json:
 *   "gmail-local": {
 *     "command": "node",
 *     "args": ["/pfad/zu/scripts/mcp-local.mjs", "--account", "main"]
 *   }
 *
 * IMPORTANT: stdout carries the protocol. Never write anything there that is
 * not a JSON-RPC message — diagnostics go to stderr.
 */

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { credsError, findCreds } from "./creds.mjs";
import { buildMime, resolveAttachments, toRaw } from "./mime.mjs";

// ------------------------------------------------------------------ startup
const argv = process.argv.slice(2);
const account = argv.includes("--account") ? argv[argv.indexOf("--account") + 1] : undefined;

const found = findCreds(account);
if (!found) {
  process.stderr.write(`${credsError(account)}\n`);
  process.exit(2);
}
const auth = new google.auth.OAuth2(
  found.env.GMAIL_CLIENT_ID,
  found.env.GMAIL_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: found.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth });

// ------------------------------------------------------------------ helpers
/** Same clipping the remote connector uses, so huge threads cannot blow up context. */
const CHARACTER_LIMIT = 25000;

function jsonResult(data) {
  const text = JSON.stringify(data, null, 2);
  return {
    content: [
      {
        type: "text",
        text:
          text.length > CHARACTER_LIMIT
            ? `${text.slice(0, CHARACTER_LIMIT)}\n... [truncated at ${CHARACTER_LIMIT} chars — narrow your query]`
            : text,
      },
    ],
  };
}

const headerMap = (payload) =>
  Object.fromEntries((payload?.headers ?? []).map((h) => [h.name, h.value]));

const decode = (data) => Buffer.from(data, "base64url").toString("utf8");

function findPart(part, mimeType) {
  if (part?.mimeType === mimeType && part.body?.data) return decode(part.body.data);
  for (const child of part?.parts ?? []) {
    const hit = findPart(child, mimeType);
    if (hit) return hit;
  }
  return null;
}

function extractBody(payload) {
  const plain = findPart(payload, "text/plain");
  if (plain) return plain;
  const html = findPart(payload, "text/html");
  if (html) return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  return payload?.body?.data ? decode(payload.body.data) : "";
}

function attachmentParts(payload, out = []) {
  if (payload?.filename && payload.body?.attachmentId) {
    out.push({
      filename: payload.filename,
      mimeType: payload.mimeType,
      size: payload.body.size,
      id: payload.body.attachmentId,
    });
  }
  for (const p of payload?.parts ?? []) attachmentParts(p, out);
  return out;
}

/** Pull In-Reply-To / References off the thread's last message so clients thread it. */
async function threadHeaders(threadId) {
  const { data } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "References", "Subject"],
  });
  const last = data.messages[data.messages.length - 1];
  const h = headerMap(last.payload);
  const mid = h["Message-ID"] ?? h["Message-Id"];
  if (!mid) return { headers: {}, subject: h.Subject ?? "" };
  return {
    headers: { "In-Reply-To": mid, References: h.References ? `${h.References} ${mid}` : mid },
    subject: h.Subject ?? "",
  };
}

/** Shared by send + draft: everything up to the base64url `raw` string. */
async function composeRaw({ to, subject, body, html, cc, bcc, thread_id, attachments }) {
  const files = resolveAttachments(attachments ?? []);
  let headers = {};
  let finalSubject = subject ?? "";

  if (thread_id) {
    const t = await threadHeaders(thread_id);
    headers = t.headers;
    if (!finalSubject && t.subject) {
      finalSubject = /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`;
    }
  }

  const mime = buildMime({
    to,
    cc,
    bcc,
    subject: finalSubject,
    text: body ?? "",
    html,
    attachments: files,
    headers,
  });

  return {
    raw: toRaw(mime),
    files: files.map((f) => ({ filename: f.name, bytes: f.size, mimeType: f.mime })),
    bytes: Buffer.byteLength(mime, "utf8"),
  };
}

// -------------------------------------------------------------------- tools
const ATTACHMENTS_SCHEMA = {
  type: "array",
  description:
    'Files to attach. Prefer { "path": "/absolute/path/file.pdf" } — the file is read from ' +
    "this machine, so its bytes never travel through the tool call. Use " +
    '{ "filename", "mimeType", "base64" } only for content you generated in memory. ' +
    "Gmail's limit is 25 MB for the whole encoded message.",
  items: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to a local file." },
      filename: {
        type: "string",
        description: "Name shown to the recipient. Defaults to the file's own name.",
      },
      mimeType: { type: "string", description: "Guessed from the extension if omitted." },
      base64: { type: "string", description: "Base64 content, instead of path." },
    },
  },
};

const COMPOSE_PROPS = {
  to: { type: "string", description: "Recipient(s), comma-separated." },
  subject: { type: "string", description: "Subject line." },
  body: { type: "string", description: "Plain-text body." },
  html: { type: "string", description: "Optional HTML body, sent alongside the plain text." },
  cc: { type: "string", description: "Cc recipient(s)." },
  bcc: { type: "string", description: "Bcc recipient(s)." },
  thread_id: { type: "string", description: "Attach as a reply within this thread." },
  attachments: ATTACHMENTS_SCHEMA,
};

const TOOLS = [
  {
    name: "gmail_get_profile",
    description:
      "Returns the email address and mailbox totals of the connected Gmail account. Use this to confirm which mailbox this server is wired to.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { data } = await gmail.users.getProfile({ userId: "me" });
      return jsonResult({
        emailAddress: data.emailAddress,
        messagesTotal: data.messagesTotal,
        threadsTotal: data.threadsTotal,
      });
    },
  },
  {
    name: "gmail_search_threads",
    description:
      'Search email threads using Gmail search syntax, e.g. "from:rechnung@lieferant.de", "is:unread newer_than:7d", "has:attachment".',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query." },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max threads to return (default 15).",
        },
      },
      required: ["query"],
    },
    handler: async ({ query, max_results = 15 }) => {
      const { data } = await gmail.users.threads.list({
        userId: "me",
        q: query,
        maxResults: max_results,
      });
      const threads = await Promise.all(
        (data.threads ?? []).map(async (t) => {
          const { data: full } = await gmail.users.threads.get({
            userId: "me",
            id: t.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });
          const last = full.messages[full.messages.length - 1];
          const h = headerMap(last.payload);
          return {
            id: t.id,
            snippet: t.snippet,
            subject: h.Subject,
            from: h.From,
            date: h.Date,
            unread: (last.labelIds ?? []).includes("UNREAD"),
          };
        })
      );
      return jsonResult({ count: threads.length, threads });
    },
  },
  {
    name: "gmail_get_thread",
    description:
      "Fetch all messages of one thread with decoded plain-text bodies and a list of any attachments.",
    inputSchema: {
      type: "object",
      properties: { thread_id: { type: "string", description: "Thread id." } },
      required: ["thread_id"],
    },
    handler: async ({ thread_id }) => {
      const { data } = await gmail.users.threads.get({
        userId: "me",
        id: thread_id,
        format: "full",
      });
      const messages = (data.messages ?? []).map((m) => {
        const h = headerMap(m.payload);
        return {
          id: m.id,
          from: h.From,
          to: h.To,
          cc: h.Cc,
          date: h.Date,
          subject: h.Subject,
          labelIds: m.labelIds ?? [],
          attachments: attachmentParts(m.payload).map((f) => ({
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
          })),
          body: extractBody(m.payload),
        };
      });
      return jsonResult({ id: data.id, messages });
    },
  },
  {
    name: "gmail_get_message",
    description: "Fetch one message by id, with headers, decoded body and attachment list.",
    inputSchema: {
      type: "object",
      properties: { message_id: { type: "string", description: "Message id." } },
      required: ["message_id"],
    },
    handler: async ({ message_id }) => {
      const { data } = await gmail.users.messages.get({
        userId: "me",
        id: message_id,
        format: "full",
      });
      const h = headerMap(data.payload);
      return jsonResult({
        id: data.id,
        threadId: data.threadId,
        from: h.From,
        to: h.To,
        cc: h.Cc,
        date: h.Date,
        subject: h.Subject,
        labelIds: data.labelIds ?? [],
        attachments: attachmentParts(data.payload).map((f) => ({
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
        })),
        body: extractBody(data.payload),
      });
    },
  },
  {
    name: "gmail_download_attachment",
    description:
      "Save a message's attachments to disk and return the paths. Bytes are written straight to the file, so they never pass through the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "Message id." },
        out_dir: {
          type: "string",
          description: "Directory to write into. Defaults to the current working directory.",
        },
        filename: {
          type: "string",
          description: "Only save the attachment with this exact name.",
        },
      },
      required: ["message_id"],
    },
    handler: async ({ message_id, out_dir, filename }) => {
      const { data: msg } = await gmail.users.messages.get({
        userId: "me",
        id: message_id,
        format: "full",
      });
      let files = attachmentParts(msg.payload);
      if (filename) files = files.filter((f) => f.filename === filename);
      if (!files.length) {
        return jsonResult({ ok: true, saved: [], note: "no matching attachments on this message" });
      }

      const dir = path.resolve(out_dir ?? process.cwd());
      fs.mkdirSync(dir, { recursive: true });

      const saved = [];
      for (const f of files) {
        const { data: att } = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: message_id,
          id: f.id,
        });
        const bytes = Buffer.from(att.data, "base64url");
        const target = path.join(dir, path.basename(f.filename));
        fs.writeFileSync(target, bytes);
        saved.push({ path: target, bytes: bytes.length, mimeType: f.mimeType });
      }
      return jsonResult({ ok: true, saved });
    },
  },
  {
    name: "gmail_create_draft",
    description:
      "Create a draft email (NOT sent), optionally with file attachments and as a reply within a thread.",
    inputSchema: { type: "object", properties: COMPOSE_PROPS, required: ["to"] },
    handler: async (a) => {
      const { raw, files, bytes } = await composeRaw(a);
      const { data } = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw, ...(a.thread_id ? { threadId: a.thread_id } : {}) },
        },
      });
      return jsonResult({
        ok: true,
        draftId: data.id,
        messageId: data.message?.id,
        attachments: files,
        messageBytes: bytes,
      });
    },
  },
  {
    name: "gmail_send_email",
    description:
      "Send an email immediately, optionally with file attachments. This has an external side effect — confirm with the user before calling it.",
    inputSchema: { type: "object", properties: COMPOSE_PROPS, required: ["to"] },
    handler: async (a) => {
      const { raw, files, bytes } = await composeRaw(a);
      const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, ...(a.thread_id ? { threadId: a.thread_id } : {}) },
      });
      return jsonResult({
        ok: true,
        messageId: data.id,
        threadId: data.threadId,
        attachments: files,
        messageBytes: bytes,
      });
    },
  },
  {
    name: "gmail_list_labels",
    description:
      "List the mailbox's labels with their ids. Use it to resolve a user label's display name to the id that gmail_modify_labels expects.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { data } = await gmail.users.labels.list({ userId: "me" });
      const labels = (data.labels ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type }));
      return jsonResult({ count: labels.length, labels });
    },
  },
  {
    name: "gmail_modify_labels",
    description:
      'Add and/or remove labels on a message or a whole thread. Archiving is removing "INBOX"; marking read is removing "UNREAD". System ids are literal ("INBOX", "UNREAD", "STARRED", "IMPORTANT"); for a user label pass the id from gmail_list_labels, not its display name.',
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message id or thread id — see target." },
        target: {
          type: "string",
          enum: ["message", "thread"],
          description: "Whether id refers to a single message or a whole thread (default 'message').",
        },
        add_label_ids: {
          type: "array",
          items: { type: "string" },
          description: 'Label ids to add, e.g. ["IMPORTANT"].',
        },
        remove_label_ids: {
          type: "array",
          items: { type: "string" },
          description: 'Label ids to remove, e.g. ["INBOX","UNREAD"].',
        },
      },
      required: ["id"],
    },
    handler: async ({ id, target = "message", add_label_ids = [], remove_label_ids = [] }) => {
      if (add_label_ids.length === 0 && remove_label_ids.length === 0) {
        throw new Error("Nothing to change: pass add_label_ids and/or remove_label_ids.");
      }
      const api = target === "thread" ? gmail.users.threads : gmail.users.messages;
      const { data } = await api.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: add_label_ids, removeLabelIds: remove_label_ids },
      });
      return jsonResult({
        ok: true,
        id: data.id,
        target,
        // threads.modify answers with its messages, not with one label set.
        labelIds: target === "thread" ? undefined : data.labelIds,
        addLabelIds: add_label_ids,
        removeLabelIds: remove_label_ids,
      });
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ----------------------------------------------------------------- protocol
const OUR_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  // Notifications carry no id and must never be answered.
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: KNOWN_PROTOCOLS.has(params?.protocolVersion)
          ? params.protocolVersion
          : OUR_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "gmail-local", version: "1.2.0" },
      });

    case "tools/list":
      return reply(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });

    case "tools/call": {
      const tool = BY_NAME.get(params?.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        return reply(id, await tool.handler(params.arguments ?? {}));
      } catch (err) {
        // Tool failures belong in the result, not in a JSON-RPC error, so the
        // model can read the message and correct itself.
        const detail = err?.response?.data?.error?.message ?? err?.message ?? String(err);
        return reply(id, {
          content: [{ type: "text", text: `Error: ${detail}` }],
          isError: true,
        });
      }
    }

    case "ping":
      return reply(id, {});

    default:
      if (isNotification) return; // e.g. notifications/initialized, notifications/cancelled
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = "";
// Requests still awaiting a Gmail round-trip. A client that closes stdin (or
// anything piping input in) must not cut those off before they answer.
let inFlight = 0;
let stdinClosed = false;
const exitWhenDrained = () => {
  if (stdinClosed && inFlight === 0) process.exit(0);
};

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, "Parse error");
      continue;
    }
    inFlight++;
    handle(msg)
      .catch((err) => {
        process.stderr.write(`handler crashed: ${err?.stack ?? err}\n`);
        if (msg?.id != null) fail(msg.id, -32603, `Internal error: ${err?.message ?? err}`);
      })
      .finally(() => {
        inFlight--;
        exitWhenDrained();
      });
  }
});
process.stdin.on("end", () => {
  stdinClosed = true;
  exitWhenDrained();
});
