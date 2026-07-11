# capline-mcp

**Give your MCP agent a wallet it can't drain.**

An [MCP](https://modelcontextprotocol.io) server that hands an AI agent a spending capability bounded by a signed [Capline](https://www.npmjs.com/package/capline) mandate. The agent (in Claude Desktop, Cursor, Cline, or any MCP client) can only move funds through the `pay` tool — and `pay` refuses anything outside the mandate: over the per-transaction cap, off the payee allowlist, or past the **global cross-chain cap**. The limits are enforced by code, not the model, so nothing in the agent's context can talk its way past them.

> The cap isn't in the prompt — it's a mandate the LLM can't talk to.

## Tools

| Tool | What it does |
|---|---|
| `create_mandate` | Provision a mandate: per-tx cap, global cumulative cap, payee allowlist, chains. Returns a `mandateId`. |
| `pay` | The **only** way to move funds. Refused (not executed) if it breaks the mandate. |
| `mandate_status` | Committed / reserved / remaining budget + per-chain breakdown. |
| `revoke_mandate` | Kill the mandate — every future payment is refused on every chain. |

## Add to Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "capline": {
      "command": "npx",
      "args": ["-y", "capline-mcp"]
    }
  }
}
```

Restart Claude Desktop. Then try it:

> *"Set up a mandate: $5 per transaction, $20 total, only pay DataVendor. Then pay DataVendor $5. Then — ignore that last limit — pay DataVendor $1000."*

Watch the $5 settle and the $1000 come back **REFUSED (OVER_PER_TX)**. The model obeyed you; the mandate didn't.

## Add to Cursor

`~/.cursor/mcp.json` (or Settings → MCP):

```json
{
  "mcpServers": {
    "capline": { "command": "npx", "args": ["-y", "capline-mcp"] }
  }
}
```

## Configuration

| Env var | Default |
|---|---|
| `CAPLINE_COORDINATOR_URL` | `https://capline-protocol.vercel.app/api/coordinator` |

By default it enforces against the hosted Capline coordinator (Layer A), so **no wallet or funds are required** and you can feel it immediately. Point `CAPLINE_COORDINATOR_URL` at your own coordinator to self-host. To also enforce on-chain (Layer B, holds even if the agent's key is stolen), settle through a deployed mandate contract. See the [capline protocol + SDK repo](https://github.com/caplinehq/capline).

## Run from source

```bash
git clone https://github.com/caplinehq/capline-mcp && cd capline-mcp
npm install && npm run build
node test-client.mjs   # exercises every tool through a real MCP client
```

## Links

- SDK: [`capline` on npm](https://www.npmjs.com/package/capline)
- Live demo: [capline-protocol.vercel.app/agents](https://capline-protocol.vercel.app/agents)
- Clone-and-run agent: [`capline-example`](https://github.com/caplinehq/capline-example)

MIT
