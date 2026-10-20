import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@/lib/server";
import { getGmailClient } from "@/lib/gmail";
import { resolveAccount } from "@/lib/accounts";

// Dynamic Node serverless function in the EU (Frankfurt) for GDPR.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const maxDuration = 60;

/**
 * The account secret lives in the URL PATH (e.g. /<secret>/mcp), not the query
 * string. Claude's custom-connector flow keeps the path but drops the query
 * string; serving 200 on a known secret path lets it connect directly, without
 * forcing an OAuth handshake. An unknown secret returns 404 so the endpoint is
 * indistinguishable from a non-existent route.
 *
 * Each secret maps to one Gmail account (see lib/accounts.ts), so one
 * deployment serves any number of mailboxes — each added via env vars only.
 */
const handlerCache = new Map<string, (req: Request) => Promise<Response>>();

function handlerForSecret(
  secret: string,
  refreshToken: string
): (req: Request) => Promise<Response> {
  let handler = handlerCache.get(secret);
  if (!handler) {
    const gmail = getGmailClient(refreshToken);
    handler = createMcpHandler(
      (server) => registerTools(server, gmail),
      { serverInfo: { name: "gmail-second-mcp-server", version: "1.0.0" } },
      { basePath: `/${secret}`, maxDuration: 60, verboseLogs: false }
    );
    handlerCache.set(secret, handler);
  }
  return handler;
}

async function route(
  req: Request,
  ctx: { params: Promise<{ secret: string; transport: string }> }
): Promise<Response> {
  const { secret } = await ctx.params;
  const account = resolveAccount(secret);
  if (!account) {
    return new Response("Not found", { status: 404 });
  }
  return handlerForSecret(secret, account.refreshToken)(req);
}

export { route as GET, route as POST, route as DELETE };
