#!/usr/bin/env node
/**
 * Local smoke test: connects to the running MCP server, lists tools, and
 * verifies the auth guard rejects requests without the secret.
 *
 * Usage: BASE=http://localhost:3030 MCP_SECRET=test node scripts/smoke-test.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.BASE || "http://localhost:3030";
const SECRET = process.env.MCP_SECRET || "test";

async function listTools(url, label) {
  const client = new Client({ name: "smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`\n[${label}] connected. ${tools.length} tools:`);
  for (const t of tools) console.log(`  - ${t.name}`);
  await client.close();
}

async function expectNotFound(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "smoke", version: "1.0.0" },
      },
    }),
  });
  console.log(`\n[wrong-secret] status ${res.status} (expect 404)`);
  if (res.status !== 404) throw new Error("Wrong secret was NOT rejected!");
}

await expectNotFound(`${BASE}/wrong-secret-xyz/mcp`);
await listTools(`${BASE}/${SECRET}/mcp`, "with-secret");
console.log("\nSmoke test OK.\n");
