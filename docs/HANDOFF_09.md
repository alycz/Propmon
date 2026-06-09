# Handoff 09

Agent 09 implements Propmon wallet infrastructure with Privy embedded wallets for humans and a Privy server wallet as the distinct on-chain agent signer.

## Frontend

`web/app/providers.tsx` now mounts:

```tsx
<PrivyProvider>
  <QueryClientProvider>
    <WagmiProvider>
```

Privy is configured for Monad Testnet (`chainId 10143`) as both the default and supported chain. Embedded Ethereum wallets are created on login for users without wallets.

The dashboard consumes `usePropmonWallet()` from `web/lib/use-propmon-wallet.ts`:

```ts
{
  ready,
  authenticated,
  address,
  walletId,
  chainId,
  login(),
  logout(),
  ensureMonadTestnet(),
  signMessage(message)
}
```

Human contract reads and writes still use wagmi hooks. Privy owns login, wallet creation, active wallet state, chain switching, and message signing.

## Agent Signer

`agent/src/signer.ts` exposes:

```ts
type AgentSigner = {
  mode: "privy-server-wallet" | "private-key";
  getAddress(): Promise<Address>;
  sendTransaction({to, data, value?}): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
};
```

Primary mode is `privy-server-wallet`. It uses `@privy-io/node` to call:

- `wallets().get(PRIVY_SERVER_WALLET_ID)` for the signer address.
- `wallets().ethereum().sendTransaction(...)` for vault calls on `eip155:10143`.
- `wallets().ethereum().signMessage(...)` for Perpl SIWE.

`private-key` mode remains as a local fallback. Set `AGENT_SIGNER_MODE=private-key` and `AGENT_PRIVATE_KEY=0x...` to use it.

## API And Authorization Flow

Agent API:

```http
GET /agent-signer
```

Response:

```json
{"ok":true,"mode":"privy-server-wallet","address":"0x..."}
```

Web proxy:

```http
GET /api/agent-signer
```

The frontend calls the proxy, displays the returned server-wallet address, and uses the existing owner-only registry call:

```solidity
AccountRegistry.authorizeSigner(accountId, agentSignerAddress)
```

After authorization, the agent submits the same vault functions as a manual trader: `recordEntry`, funded demo opens/closes, and funded live intents.

## Environment

Frontend:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_AGENT_API_URL=http://127.0.0.1:8787
```

Agent primary mode:

```bash
AGENT_SIGNER_MODE=privy-server-wallet
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_SERVER_WALLET_ID=
PRIVY_AUTHORIZATION_PRIVATE_KEY=
AGENT_ACCOUNT_ID=1
```

Agent fallback mode:

```bash
AGENT_SIGNER_MODE=private-key
AGENT_PRIVATE_KEY=0x...
AGENT_ACCOUNT_ID=1
```

Live Perpl trading should whitelist the Privy server-wallet address returned by `/agent-signer`.

## Validation

Automated:

```bash
pnpm --filter @propmon/agent test
pnpm --filter @propmon/web build
```

Manual with real Privy credentials:

- Login creates or selects an embedded wallet on Monad Testnet.
- `ensureMonadTestnet()` switches wrong-chain wallets to `10143`.
- `/agent-signer` returns the Privy server-wallet address.
- Owner authorizes that address in `AccountRegistry`.
- Agent `recordEntry` succeeds through Privy server-wallet signing.
- Perpl SIWE message signing recovers to the same server-wallet address.

Privy additional signers and scoped policies remain a post-demo hardening path. This implementation keeps the sprint contract model intact by using a distinct on-chain agent signer address.
