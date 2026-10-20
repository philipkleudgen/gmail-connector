#!/usr/bin/env node
/**
 * send.mjs — send mail from one of the connected Gmail mailboxes, locally.
 *
 * Why this exists: the remote MCP connector can send plain-text mail, but it
 * runs on Vercel and therefore cannot read files from this Mac — every
 * attachment would have to travel through the tool call as base64. This script
 * runs locally, so `--attach some.pdf` is just a file read. It reuses the exact
 * same OAuth credentials as the connector; no extra Google consent needed.
 *
 * Credentials are looked up in this order:
 *   1. ~/.config/gmail-cli/<account>.env
 *   2. <repo>/.env.local                     (legacy: the private mailbox)
 * Each file needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 *
 * Usage:
 *   node scripts/send.mjs --account main --to a@b.de \
 *        --subject "Betreff" --text-file body.txt [--html-file body.html] \
 *        [--attach datei.pdf]... [--cc x@y] [--bcc x@y] \
 *        [--thread-id 19f7f6...] [--dry-run]
 *
 *   node scripts/send.mjs --account main --whoami
 *   node scripts/send.mjs --account main --find-thread "youtube api services"
 *
 * Always prints the recipients, subject, attachment names and byte sizes before
 * sending; --dry-run stops right there.
 */

import fs from "node:fs";
import { google } from "googleapis";
import { loadCreds } from "./creds.mjs";
import { buildMime, resolveAttachments, toRaw } from "./mime.mjs";

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const out = { attach: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const flags = ["dry-run", "whoami", "html", "help"];
    if (flags.includes(key)) {
      out[key] = true;
      continue;
    }
    const value = argv[++i];
    if (key === "attach") out.attach.push(value);
    else out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

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

if (args.help) {
  printHelp();
  process.exit(0);
}

// -------------------------------------------------------------- credentials
const { env, file: credFile } = loadCreds(args.account);

const auth = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth });

// ------------------------------------------------------------------ actions
async function whoami() {
  const { data } = await gmail.users.getProfile({ userId: "me" });
  console.log(`${data.emailAddress}  (messages: ${data.messagesTotal})`);
  console.log(`credentials: ${credFile}`);
}

async function findThread(query) {
  const { data } = await gmail.users.threads.list({ userId: "me", q: query, maxResults: 10 });
  for (const t of data.threads ?? []) {
    const { data: full } = await gmail.users.threads.get({
      userId: "me",
      id: t.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });
    const last = full.messages[full.messages.length - 1];
    const h = Object.fromEntries(last.payload.headers.map((x) => [x.name, x.value]));
    console.log(`${t.id}  ${h.Date}  ${h.From}\n    ${h.Subject}`);
  }
}

/** Pull In-Reply-To / References from the last message of the thread. */
async function threadHeaders(threadId) {
  const { data } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "References", "Subject"],
  });
  const last = data.messages[data.messages.length - 1];
  const h = Object.fromEntries(last.payload.headers.map((x) => [x.name, x.value]));
  const mid = h["Message-ID"] ?? h["Message-Id"];
  if (!mid) return {};
  return {
    "In-Reply-To": mid,
    References: h.References ? `${h.References} ${mid}` : mid,
  };
}

async function send() {
  const required = ["to", "subject"];
  for (const r of required) {
    if (!args[r]) {
      console.error(`missing --${r}`);
      process.exit(2);
    }
  }

  const text = args["text-file"]
    ? fs.readFileSync(args["text-file"], "utf8")
    : args.text ?? "";
  const html = args["html-file"] ? fs.readFileSync(args["html-file"], "utf8") : args.html;

  const attachments = resolveAttachments(args.attach.map((p) => ({ path: p })));

  const headers = args["thread-id"] ? await threadHeaders(args["thread-id"]) : {};

  const raw = buildMime({
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    text,
    html,
    attachments,
    headers,
  });

  const { data: profile } = await gmail.users.getProfile({ userId: "me" });

  console.log("── outgoing ─────────────────────────────────");
  console.log(`from:    ${profile.emailAddress}`);
  console.log(`to:      ${args.to}`);
  if (args.cc) console.log(`cc:      ${args.cc}`);
  if (args.bcc) console.log(`bcc:     ${args.bcc}`);
  console.log(`subject: ${args.subject}`);
  console.log(`body:    ${text.length} chars plain${html ? `, ${html.length} chars html` : ""}`);
  if (args["thread-id"]) {
    console.log(`reply:   thread ${args["thread-id"]}${headers["In-Reply-To"] ? " (In-Reply-To set)" : " (no Message-ID found!)"}`);
  }
  for (const a of attachments) console.log(`attach:  ${a.name}  ${a.size} bytes  ${a.mime}`);
  console.log(`raw:     ${Buffer.byteLength(raw)} bytes`);
  console.log("─────────────────────────────────────────────");

  if (args["dry-run"]) {
    console.log("dry-run — nothing sent.");
    return;
  }

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: toRaw(raw),
      ...(args["thread-id"] ? { threadId: args["thread-id"] } : {}),
    },
  });
  console.log(`sent. messageId=${data.id} threadId=${data.threadId}`);
}

// -------------------------------------------------------------------- main
try {
  if (args.whoami) await whoami();
  else if (args["find-thread"]) await findThread(args["find-thread"]);
  else await send();
} catch (err) {
  console.error("ERROR:", err?.response?.data?.error?.message ?? err.message);
  process.exit(1);
}
