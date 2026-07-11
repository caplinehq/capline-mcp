// capline-mcp — an MCP server that gives an AI agent a wallet it cannot drain.
//
// The agent (through any MCP client — Claude Desktop, Cursor, Cline) can only
// move funds through the `pay` tool, and `pay` runs every payment through a
// signed Capline mandate first: it is REFUSED if it exceeds the per-transaction
// cap, the payee isn't allowlisted, or it would breach the GLOBAL cumulative cap
// across chains. The caps are enforced by code, not the model — so no prompt
// injection in the agent's context can talk its way past them.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CoordinatorClient } from "capline/coordinator";
import { hashIntent } from "capline";
import { z } from "zod";

const COORDINATOR_URL =
  process.env.CAPLINE_COORDINATOR_URL || "https://capline-protocol.vercel.app/api/coordinator";
const coord = new CoordinatorClient(COORDINATOR_URL);

const CHAINS = ["solana", "avalanche", "base", "stellar"] as const;

const server = new McpServer({ name: "capline-mcp", version: "0.1.0" });

function text(s: string, isError = false) {
  return { content: [{ type: "text" as const, text: s }], isError };
}

server.tool(
  "create_mandate",
  "Provision a spend mandate the agent must operate under: a per-transaction cap, a cumulative cap enforced GLOBALLY across every chain, and an optional payee allowlist. Returns a mandateId to pass to `pay`. Normally the human principal sets this up once, before handing the agent any spending ability.",
  {
    maxPerTx: z.number().positive().describe("per-transaction ceiling, in USDC"),
    maxTotal: z.number().positive().describe("cumulative ceiling in USDC, across every chain combined"),
    chains: z.array(z.enum(CHAINS)).default(["solana"]).describe("chains this mandate is provisioned on"),
    allowedPayees: z.array(z.string()).default([]).describe("allowed payee identities; empty = any payee"),
    principal: z.string().default("mcp-principal").describe("identity granting the authority"),
  },
  async ({ maxPerTx, maxTotal, chains, allowedPayees, principal }) => {
    const intent = { principal, maxPerTx, totalCap: maxTotal, chains, allowedPayees };
    const { mandate } = await coord.createMandate({
      principal,
      ap2Json: JSON.stringify(intent),
      maxPerTx,
      maxCumulative: maxTotal,
      chains,
      allowedPayees,
    });
    return text(
      `Mandate created.\n` +
        `  id: ${mandate.mandateId}\n` +
        `  cap: $${maxPerTx}/tx · $${maxTotal} total (global, across chains)\n` +
        `  chains: ${chains.join(", ")}\n` +
        `  allowlist: ${allowedPayees.length ? allowedPayees.join(", ") : "(any payee)"}\n` +
        `  sha256(AP2): ${hashIntent(intent)}\n` +
        `Pass this id to \`pay\`. The agent cannot exceed these limits.`,
    );
  },
);

server.tool(
  "pay",
  "Make a payment on behalf of the agent. THIS IS THE ONLY WAY TO MOVE FUNDS, and it is enforced by the mandate: the payment is REFUSED (not executed) if it exceeds the per-transaction cap, the payee is not on the allowlist, or it would breach the global cross-chain cap. A prompt injection in the agent's context cannot bypass this.",
  {
    mandateId: z.string().describe("the mandate to spend under (from create_mandate)"),
    chain: z.enum(CHAINS).default("solana").describe("chain to settle on"),
    to: z.string().describe("recipient identity / wallet"),
    amount: z.number().positive().describe("amount to pay, in USDC"),
  },
  async ({ mandateId, chain, to, amount }) => {
    const auth = await coord.authorize(mandateId, chain, to, amount);
    if (!auth.ok) {
      return text(
        `REFUSED (${auth.reason}). Tried to pay $${amount} to ${to} on ${chain}, but that is outside the mandate — it was NOT executed. Remaining budget: $${auth.remaining}.`,
        true,
      );
    }
    await coord.commit(mandateId, auth.ticket.ticketId);
    return text(
      `SETTLED. Paid $${amount} to ${to} on ${chain}. Remaining budget: $${auth.remaining}. (ticket ${auth.ticket.ticketId})`,
    );
  },
);

server.tool(
  "mandate_status",
  "Read a mandate's current state: committed spend, reserved, remaining budget, and the per-chain breakdown.",
  { mandateId: z.string().describe("the mandate to inspect") },
  async ({ mandateId }) => {
    const s = await coord.status(mandateId);
    const per =
      Object.entries(s.perChain)
        .map(([c, v]) => `${c}: $${v}`)
        .join(", ") || "(nothing spent yet)";
    return text(
      `Mandate ${mandateId}\n` +
        `  committed: $${s.committed}\n` +
        `  reserved:  $${s.reserved}\n` +
        `  remaining: $${s.remaining} of $${s.mandate.maxCumulative}\n` +
        `  per-chain: ${per}\n` +
        `  revoked: ${s.mandate.revoked}`,
    );
  },
);

server.tool(
  "revoke_mandate",
  "Revoke a mandate. After this, every payment under it is refused on every chain.",
  { mandateId: z.string().describe("the mandate to revoke") },
  async ({ mandateId }) => {
    const r = await coord.revoke(mandateId);
    return text(
      r.ok
        ? `Mandate ${mandateId} revoked. All future payments under it will be refused.`
        : `Mandate ${mandateId} not found.`,
      !r.ok,
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is the JSON-RPC channel — diagnostics MUST go to stderr.
console.error(`capline-mcp ready · coordinator ${COORDINATOR_URL}`);
