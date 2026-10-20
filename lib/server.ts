import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { gmail_v1 } from "googleapis";
import {
  getHeader,
  extractBody,
  buildRawMessage,
  type OutgoingMessage,
} from "@/lib/gmail";

const CHARACTER_LIMIT = 25000;

function jsonResult(data: unknown) {
  const text = JSON.stringify(data, null, 2);
  const clipped =
    text.length > CHARACTER_LIMIT
      ? text.slice(0, CHARACTER_LIMIT) +
        `\n... [truncated at ${CHARACTER_LIMIT} chars — narrow your query]`
      : text;
  return {
    content: [{ type: "text" as const, text: clipped }],
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Register the Gmail tools on a server, all bound to one account's client.
 */
export function registerTools(server: McpServer, gmail: gmail_v1.Gmail) {
  // -- get profile -------------------------------------------------------
  server.registerTool(
    "gmail_get_profile",
    {
      title: "Get Gmail account profile",
      description:
        "Returns the email address and mailbox totals of the connected Gmail account. Use this to confirm which account this connector is wired to.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const { data } = await gmail.users.getProfile({ userId: "me" });
        return jsonResult({
          emailAddress: data.emailAddress,
          messagesTotal: data.messagesTotal,
          threadsTotal: data.threadsTotal,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- search threads ----------------------------------------------------
  server.registerTool(
    "gmail_search_threads",
    {
      title: "Search Gmail threads",
      description: `Search email threads in the connected Gmail account using Gmail's search syntax.

Args:
  - query (string): Gmail search query, e.g. "from:rechnung@lieferant.de", "subject:Buchung newer_than:7d", "is:unread label:wichtig".
  - max_results (number): Max threads to return (1-50, default 15).

Returns JSON: { count, threads: [{ id, snippet, subject, from, date, unread }] }.`,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Gmail search query, e.g. "is:unread from:foo@bar.de newer_than:7d"'),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(15)
          .describe("Maximum number of threads to return"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, max_results }) => {
      try {
        const list = await gmail.users.threads.list({
          userId: "me",
          q: query,
          maxResults: max_results,
        });
        const threads = list.data.threads || [];

        const detailed = await Promise.all(
          threads.map(async (t) => {
            const { data } = await gmail.users.threads.get({
              userId: "me",
              id: t.id!,
              format: "metadata",
              metadataHeaders: ["Subject", "From", "Date"],
            });
            const lastMsg = data.messages?.[data.messages.length - 1];
            const headers = lastMsg?.payload?.headers;
            const labels = lastMsg?.labelIds || [];
            return {
              id: t.id,
              snippet: t.snippet,
              subject: getHeader(headers, "Subject"),
              from: getHeader(headers, "From"),
              date: getHeader(headers, "Date"),
              unread: labels.includes("UNREAD"),
            };
          })
        );

        return jsonResult({ count: detailed.length, threads: detailed });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- get thread --------------------------------------------------------
  server.registerTool(
    "gmail_get_thread",
    {
      title: "Get a Gmail thread",
      description: `Fetch all messages of a single thread, including decoded plain-text bodies.

Args:
  - thread_id (string): The thread id from gmail_search_threads.

Returns JSON: { id, messages: [{ id, from, to, date, subject, labelIds, body }] }.`,
      inputSchema: {
        thread_id: z.string().min(1).describe("Thread id to fetch"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ thread_id }) => {
      try {
        const { data } = await gmail.users.threads.get({
          userId: "me",
          id: thread_id,
          format: "full",
        });
        const messages = (data.messages || []).map((m) => {
          const headers = m.payload?.headers;
          return {
            id: m.id,
            from: getHeader(headers, "From"),
            to: getHeader(headers, "To"),
            cc: getHeader(headers, "Cc"),
            date: getHeader(headers, "Date"),
            subject: getHeader(headers, "Subject"),
            labelIds: m.labelIds || [],
            body: extractBody(m.payload),
          };
        });
        return jsonResult({ id: data.id, messages });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- get single message ------------------------------------------------
  server.registerTool(
    "gmail_get_message",
    {
      title: "Get a single Gmail message",
      description: `Fetch one message by id with headers and decoded plain-text body.

Args:
  - message_id (string): The message id.

Returns JSON: { id, threadId, from, to, cc, date, subject, labelIds, body }.`,
      inputSchema: {
        message_id: z.string().min(1).describe("Message id to fetch"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ message_id }) => {
      try {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: message_id,
          format: "full",
        });
        const headers = data.payload?.headers;
        return jsonResult({
          id: data.id,
          threadId: data.threadId,
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          cc: getHeader(headers, "Cc"),
          date: getHeader(headers, "Date"),
          subject: getHeader(headers, "Subject"),
          labelIds: data.labelIds || [],
          body: extractBody(data.payload),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- list labels -------------------------------------------------------
  server.registerTool(
    "gmail_list_labels",
    {
      title: "List Gmail labels",
      description:
        "List all labels (system + user) with their ids. Use the ids with gmail_modify_labels.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const { data } = await gmail.users.labels.list({ userId: "me" });
        const labels = (data.labels || []).map((l) => ({
          id: l.id,
          name: l.name,
          type: l.type,
        }));
        return jsonResult({ count: labels.length, labels });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- modify labels -----------------------------------------------------
  server.registerTool(
    "gmail_modify_labels",
    {
      title: "Add or remove Gmail labels",
      description: `Add and/or remove labels on a message or an entire thread. Common uses: mark read (remove "UNREAD"), archive (remove "INBOX"), apply a user label.

Args:
  - id (string): Message id OR thread id (see target).
  - target ('message' | 'thread'): Whether id refers to a single message or a whole thread (default 'message').
  - add_label_ids (string[]): Label ids to add.
  - remove_label_ids (string[]): Label ids to remove.`,
      inputSchema: {
        id: z.string().min(1).describe("Message id or thread id"),
        target: z
          .enum(["message", "thread"])
          .default("message")
          .describe("Whether id is a message or a thread"),
        add_label_ids: z
          .array(z.string())
          .default([])
          .describe('Label ids to add, e.g. ["IMPORTANT"]'),
        remove_label_ids: z
          .array(z.string())
          .default([])
          .describe('Label ids to remove, e.g. ["UNREAD","INBOX"]'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id, target, add_label_ids, remove_label_ids }) => {
      try {
        const requestBody = {
          addLabelIds: add_label_ids,
          removeLabelIds: remove_label_ids,
        };
        if (target === "thread") {
          await gmail.users.threads.modify({ userId: "me", id, requestBody });
        } else {
          await gmail.users.messages.modify({ userId: "me", id, requestBody });
        }
        return jsonResult({ ok: true, id, target, ...requestBody });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- create draft ------------------------------------------------------
  server.registerTool(
    "gmail_create_draft",
    {
      title: "Create a Gmail draft",
      description: `Create a draft email (NOT sent). If thread_id is given, the draft is attached to that thread as a reply.

Args:
  - to (string): Recipient(s), comma-separated.
  - subject (string): Subject line.
  - body (string): Plain-text body.
  - cc (string, optional), bcc (string, optional).
  - thread_id (string, optional): Attach as reply to this thread.

Returns JSON: { ok, draftId, messageId }.`,
      inputSchema: {
        to: z.string().min(1).describe("Recipient(s), comma-separated"),
        subject: z.string().describe("Subject line"),
        body: z.string().describe("Plain-text body"),
        cc: z.string().optional().describe("Cc recipient(s)"),
        bcc: z.string().optional().describe("Bcc recipient(s)"),
        thread_id: z
          .string()
          .optional()
          .describe("Attach the draft as a reply to this thread"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, subject, body, cc, bcc, thread_id }) => {
      try {
        const outgoing: OutgoingMessage = await withThreadHeaders(
          gmail,
          { to, subject, body, cc, bcc },
          thread_id
        );
        const raw = buildRawMessage(outgoing);
        const { data } = await gmail.users.drafts.create({
          userId: "me",
          requestBody: {
            message: { raw, ...(thread_id ? { threadId: thread_id } : {}) },
          },
        });
        return jsonResult({
          ok: true,
          draftId: data.id,
          messageId: data.message?.id,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // -- send email --------------------------------------------------------
  server.registerTool(
    "gmail_send_email",
    {
      title: "Send a Gmail email",
      description: `Send an email immediately from the connected account. This has an external side effect — the assistant must confirm with the user before calling it. If thread_id is given, the message is sent as a reply within that thread.

Args:
  - to (string): Recipient(s), comma-separated.
  - subject (string): Subject line.
  - body (string): Plain-text body.
  - cc (string, optional), bcc (string, optional).
  - thread_id (string, optional): Send as reply within this thread.

Returns JSON: { ok, messageId, threadId }.`,
      inputSchema: {
        to: z.string().min(1).describe("Recipient(s), comma-separated"),
        subject: z.string().describe("Subject line"),
        body: z.string().describe("Plain-text body"),
        cc: z.string().optional().describe("Cc recipient(s)"),
        bcc: z.string().optional().describe("Bcc recipient(s)"),
        thread_id: z
          .string()
          .optional()
          .describe("Send as a reply within this thread"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, subject, body, cc, bcc, thread_id }) => {
      try {
        const outgoing: OutgoingMessage = await withThreadHeaders(
          gmail,
          { to, subject, body, cc, bcc },
          thread_id
        );
        const raw = buildRawMessage(outgoing);
        const { data } = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw, ...(thread_id ? { threadId: thread_id } : {}) },
        });
        return jsonResult({
          ok: true,
          messageId: data.id,
          threadId: data.threadId,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

/**
 * When replying within a thread, populate In-Reply-To / References from the
 * thread's last message so Gmail and other clients thread the reply correctly.
 */
async function withThreadHeaders(
  gmail: gmail_v1.Gmail,
  base: OutgoingMessage,
  threadId?: string
): Promise<OutgoingMessage> {
  if (!threadId) return base;
  try {
    const { data } = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References", "Subject"],
    });
    const last = data.messages?.[data.messages.length - 1];
    const headers = last?.payload?.headers;
    const messageId = getHeader(headers, "Message-ID");
    const refs = getHeader(headers, "References");
    const subject = getHeader(headers, "Subject");
    return {
      ...base,
      subject:
        base.subject ||
        (subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`),
      inReplyTo: messageId || undefined,
      references: [refs, messageId].filter(Boolean).join(" ") || undefined,
    };
  } catch {
    // If metadata lookup fails, fall back to a plain message.
    return base;
  }
}
