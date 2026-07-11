# capline

**Cross-chain spend authority for AI agents.**

The cap isn't in the prompt — it's a contract the LLM can't talk to.

Give an autonomous agent a wallet and it will do whatever a prompt injection tells it to. `capline` binds a **signed AP2 mandate** — per-transaction cap, a **global cumulative cap that spans every chain at once**, expiry, and a payee allowlist — and enforces it in two layers:

- **Layer A** (off-chain): a constrained signer that reads *numbers*, never natural language, and refuses to even build an out-of-bounds payment. No jailbreak changes `value > maxPerTx`.
- **Layer B** (on-chain): the mandate primitive deployed natively on each chain reverts an out-of-mandate settle — even if the agent's key is fully compromised.
- **Cross-chain** (coordinator): one canonical mandate governs spend across Solana + Avalanche + Base together. The global cap is the one invariant no single chain can see.

Live on **Solana** (devnet) and **Avalanche** (Fuji) today; **Base** (Sepolia) and **Stellar** (Soroban) rolling in.

## Install

```bash
npm i capline
# then the chains you use:
npm i viem x402                                   # for capline/evm
npm i @coral-xyz/anchor @solana/web3.js @solana/spl-token   # for capline/solana
```

Chain deps are optional peers — install only what you touch.

## Core

```ts
import { CHAINS, ap2HashHex, toBaseUnits, type AP2IntentMandate } from "capline";

const mandate: AP2IntentMandate = {
  principal, agent, mint: CHAINS.base.usdc,
  maxPerTx: toBaseUnits(25).toString(),
  totalCap: toBaseUnits(100).toString(),
  notAfter: 0, merchants: [merchant], nonce: "1",
};
const commitment = ap2HashHex(mandate); // 0x… → store on-chain
```

## Cross-chain coordinator

One mandate, enforced globally across chains:

```ts
import { CoordinatorClient } from "capline/coordinator";

const coord = new CoordinatorClient("https://capline-protocol.vercel.app/api/coordinator");
const { mandate } = await coord.createMandate({
  principal, ap2Json: JSON.stringify(intent),
  maxPerTx: 25, maxCumulative: 100,
  chains: ["solana", "avalanche", "base"],
  allowedPayees: [merchant],
});

// before any single-chain settle, clear it against the GLOBAL budget:
const auth = await coord.authorize(mandate.mandateId, "base", payee, 25);
if (!auth.ok) throw new Error(auth.reason); // e.g. OVER_GLOBAL_CAP
// …settle on-chain (Layer B)…
await coord.commit(mandate.mandateId, auth.ticket.ticketId);
```

An agent on Solana and an agent on Base drawing from the same 100-USDC mandate **cannot jointly exceed it** — the coordinator blocks the breach neither chain could see.

## EVM (Avalanche, Base)

```ts
import { ConstrainedSigner, withCapline } from "capline/evm";

const signer = new ConstrainedSigner(agentKey, publicClient, CHAINS.base.mandate as `0x${string}`);
const client = withCapline({ signer, mandateId });

// returns a real x402 X-PAYMENT header only if within mandate; else throws MandateExceeded
const header = await client.pay(paymentRequirements);
```

## Solana

```ts
import { withCapline } from "capline/solana";

const client = withCapline({ program, mandate, agent });
const sig = await client.pay({ merchant, merchantTokenAccount, amount: 5_000_000n });
```

## License

MIT
