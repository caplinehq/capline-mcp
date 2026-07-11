// Exercises the built server through a real MCP client over stdio.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
const client = new Client({ name: "capline-mcp-test", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => t.name).join(", "));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content?.[0]?.text ?? "";
  console.log(`\n[${name}]${r.isError ? "  ⚠ isError" : ""}\n${t}`);
  return t;
};

const created = await call("create_mandate", {
  maxPerTx: 5, maxTotal: 20, chains: ["solana"], allowedPayees: ["DataVendor"],
});
const id = /id: (\S+)/.exec(created)[1];

await call("pay", { mandateId: id, chain: "solana", to: "DataVendor", amount: 5 });
await call("pay", { mandateId: id, chain: "solana", to: "DataVendor", amount: 1000 });
await call("pay", { mandateId: id, chain: "solana", to: "Scammer", amount: 3 });
await call("mandate_status", { mandateId: id });
await call("revoke_mandate", { mandateId: id });
await call("pay", { mandateId: id, chain: "solana", to: "DataVendor", amount: 1 });

await client.close();
process.exit(0);
