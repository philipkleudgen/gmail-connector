#!/usr/bin/env node
/**
 * read.mjs — the read/label half of the local Gmail CLI (counterpart to send.mjs).
 *
 * Same credentials, same mailboxes: ~/.config/gmail-cli/<account>.env, written by
 * authorize.mjs. The token carries gmail.modify, so everything here works without
 * any extra consent.
 *
 * Subcommands:
 *   search   --q "<gmail query>" [--max 20]        list matching threads
 *   thread   --id <threadId> [--chars 2000]        all messages of a thread
 *   message  --id <messageId> [--chars 2000]       one message with headers
 *   labels                                         list label names -> ids
 *   label    --id <messageId> --add A --remove B   add/remove labels (repeatable)
 *   download --id <messageId> [--out <dir>]        save attachments to disk
 *
 * Examples:
 *   node scripts/read.mjs search --account main --q "from:easybill newer_than:7d"
 *   node scripts/read.mjs thread --account main --id 19f7f68fb4a3f528
 *   node scripts/read.mjs download --account main --id 19f98ddc... --out ~/Desktop
 *   node scripts/read.mjs label --account main --id 19f9... --add STARRED --remove UNREAD
 *
 * Attachments are written to disk, so their bytes never travel through a tool
 * call — the same reason send.mjs takes file paths instead of base64.
 */

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { loadCreds } from "./creds.mjs";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const cmd = argv[0]?.startsWith("--") ? undefined : argv.shift();
const args = { add: [], remove: [] };
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const key = argv[i].slice(2);
  if (key === "help") {
    args.help = true;
    continue;
  }
  const value = argv[++i];
  if (key === "add" || key === "remove") args[key].push(value);
  else args[key] = value;
}

/** Print the file header as readable help, without the comment syntax. */
function printHelp() {
  const raw = fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0];
  console.log(
    raw
      .replace(/^#!.*\n/, "")
      .replace(/^\/\*\*\n/, "")
      .split("\n")
      .map((l) => l.replace(/^ \* ?/, ""))
      .join("\n")
      .trim()
  );
}

if (!cmd || args.help) {
  printHelp();
  process.exit(args.help ? 0 : 2);
}

// -------------------------------------------------------------- credentials
const { env } = loadCreds(args.account);
const auth = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth });

// ------------------------------------------------------------------ helpers
const HEADERS = ["Subject", "From", "To", "Cc", "Date", "Message-ID"];

function headerMap(payload) {
  return Object.fromEntries((payload?.headers ?? []).map((h) => [h.name, h.value]));
}

/** Depth-first walk for the first text/plain part; falls back to text/html. */
function extractBody(payload) {
  const found = { plain: null, html: null };
  const walk = (p) => {
    if (!p) return;
    const data = p.body?.data;
    if (data) {
      const text = Buffer.from(data, "base64url").toString("utf8");
      if (p.mimeType === "text/plain" && !found.plain) found.plain = text;
      if (p.mimeType === "text/html" && !found.html) found.html = text;
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  if (found.plain) return found.plain;
  if (found.html) {
    return found.html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  return "(no text body)";
}

function attachmentParts(payload) {
  const out = [];
  const walk = (p) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({ filename: p.filename, mimeType: p.mimeType, size: p.body.size, id: p.body.attachmentId });
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  return out;
}

function printMessage(msg, chars) {
  const h = headerMap(msg.payload);
  console.log("─".repeat(60));
  console.log(`id:      ${msg.id}`);
  for (const k of HEADERS) if (h[k]) console.log(`${(k.toLowerCase() + ":").padEnd(9)}${h[k]}`);
  if (msg.labelIds?.length) console.log(`labels:  ${msg.labelIds.join(", ")}`);
  const files = attachmentParts(msg.payload);
  for (const f of files) console.log(`attach:  ${f.filename}  ${f.size} bytes  ${f.mimeType}`);
  const body = extractBody(msg.payload).trim();
  const limit = Number(chars ?? 2000);
  console.log("");
  console.log(body.length > limit ? `${body.slice(0, limit)}\n… [${body.length - limit} more chars]` : body);
}

// ----------------------------------------------------------------- commands
async function search() {
  if (!args.q) {
    console.error("missing --q");
    process.exit(2);
  }
  const { data } = await gmail.users.threads.list({
    userId: "me",
    q: args.q,
    maxResults: Number(args.max ?? 20),
  });
  const threads = data.threads ?? [];
  if (!threads.length) return console.log("no matches");
  for (const t of threads) {
    const { data: full } = await gmail.users.threads.get({
      userId: "me",
      id: t.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });
    const last = full.messages[full.messages.length - 1];
    const h = headerMap(last.payload);
    const n = full.messages.length;
    console.log(`${t.id}  ${h.Date}  ${n > 1 ? `(${n} msgs) ` : ""}${h.From}`);
    console.log(`    ${h.Subject ?? "(no subject)"}`);
  }
}

async function thread() {
  if (!args.id) {
    console.error("missing --id");
    process.exit(2);
  }
  const { data } = await gmail.users.threads.get({ userId: "me", id: args.id, format: "full" });
  console.log(`thread ${data.id} — ${data.messages.length} message(s)`);
  for (const m of data.messages) printMessage(m, args.chars);
}

async function message() {
  if (!args.id) {
    console.error("missing --id");
    process.exit(2);
  }
  const { data } = await gmail.users.messages.get({ userId: "me", id: args.id, format: "full" });
  printMessage(data, args.chars);
}

async function labels() {
  const { data } = await gmail.users.labels.list({ userId: "me" });
  const rows = (data.labels ?? []).sort((a, b) => a.name.localeCompare(b.name));
  for (const l of rows) console.log(`${l.id.padEnd(28)} ${l.name}${l.type === "system" ? "  (system)" : ""}`);
}

async function label() {
  if (!args.id) {
    console.error("missing --id");
    process.exit(2);
  }
  if (!args.add.length && !args.remove.length) {
    console.error("nothing to do — pass --add and/or --remove");
    process.exit(2);
  }
  const { data } = await gmail.users.messages.modify({
    userId: "me",
    id: args.id,
    requestBody: { addLabelIds: args.add, removeLabelIds: args.remove },
  });
  console.log(`labels now: ${(data.labelIds ?? []).join(", ")}`);
}

async function download() {
  if (!args.id) {
    console.error("missing --id");
    process.exit(2);
  }
  const outDir = path.resolve(args.out ?? process.cwd());
  fs.mkdirSync(outDir, { recursive: true });
  const { data: msg } = await gmail.users.messages.get({ userId: "me", id: args.id, format: "full" });
  const files = attachmentParts(msg.payload);
  if (!files.length) return console.log("no attachments on this message");
  for (const f of files) {
    const { data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: args.id,
      id: f.id,
    });
    // Keep the sender's filename but never let it escape the target directory.
    const target = path.join(outDir, path.basename(f.filename));
    const bytes = Buffer.from(data.data, "base64url");
    fs.writeFileSync(target, bytes);
    console.log(`${target}  ${bytes.length} bytes`);
  }
}

// --------------------------------------------------------------------- main
const commands = { search, thread, message, labels, label, download };
if (!commands[cmd]) {
  console.error(`unknown command "${cmd}" — one of: ${Object.keys(commands).join(", ")}`);
  process.exit(2);
}

try {
  await commands[cmd]();
} catch (err) {
  console.error("ERROR:", err?.response?.data?.error?.message ?? err.message);
  process.exit(1);
}
