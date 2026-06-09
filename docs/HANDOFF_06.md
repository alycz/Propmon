# Handoff 06

Agent 06 implements the Propmon authorized-signer agent, Perpl trading client helpers, live-intent watcher, fill reconciliation path, and deterministic demo loop.

## Package

Workspace: `agent`

Commands:

```bash
pnpm --filter @propmon/agent build
pnpm --filter @propmon/agent test
PROPMON_MODE=demo pnpm agent:dev
PROPMON_MODE=live pnpm agent:dev
```

## Environment

Required for all runs:

```bash
AGENT_PRIVATE_KEY=0x...
AGENT_ACCOUNT_ID=1
PROPMON_MODE=demo # or live
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

Contract addresses are read from `shared/deployments.json` first, with env overrides:

```bash
ACCOUNT_REGISTRY_ADDRESS=0x...
EXAMINATION_VAULT_ADDRESS=0x...
FUNDED_VAULT_ADDRESS=0x...
PRICE_ADAPTER_ADDRESS=0x...
```

`shared/deployments.json` currently may contain null values. Agent 06 fails fast with a clear deployment-address error until those are filled or env overrides are supplied.

Live reconciliation also requires:

```bash
RECONCILER_PRIVATE_KEY=0x...
PERPL_LFR_SEED=0
PERPL_LEVERAGE_HUNDREDTHS=1000
PERPL_TRADING_WS_PATH=/ws/v1/trading
```

## Behavior

The agent key has no special contract privileges. It must already be authorized through `AccountRegistry.authorizeSigner(accountId, agentAddress)`.

Routing:

- `EXAMINATION`: calls `ExaminationVault.recordEntry`.
- `FUNDED + demo`: calls `FundedVault.openPositionDemo` or `closePositionDemo`.
- `FUNDED + live`: calls `FundedVault.openPositionLive` or `closePositionLive`; the live-intent watcher submits the matching Perpl WebSocket order.
- Other states: logs idle status and does not trade.

Demo mode uses `shared/demo-config.json.scriptedPass.entries` in step order. Those entries are deterministic and are labeled by code as `scripted-demo`.

## Perpl Auth And Live Orders

SIWE flow:

1. `POST /v1/auth/payload` with wallet address and chain id.
2. Sign the returned SIWE message with `AGENT_PRIVATE_KEY`.
3. `POST /v1/auth/connect` with address, message, and signature.
4. Use the returned auth cookie and nonce to open `wss://testnet.perpl.xyz/ws/v1/trading`.
5. Send `AuthSignIn` (`mt:4`) and submit `OrderRequest` (`mt:22`) messages.

Whitelist failures (`418` or `423`) throw `PerplWhitelistError`, log demo-mode guidance, and do not crash the process. Funded demo execution remains the stage fallback.

Order request IDs are persisted in `.context/agent-rq-state.json` by default and are strictly increasing from `PERPL_LFR_SEED`. Override the path with `AGENT_STATE_PATH`.

## Reconciliation Interface

Live fills are reconciled with:

```solidity
FundedVault.reconcileFill(
    uint256 accountId,
    uint256 requestId,
    uint256 marketId,
    int256 sizeDelta,
    uint256 fillPrice
)
```

The caller must hold `RECONCILER_ROLE`, so use `RECONCILER_PRIVATE_KEY` for fill reconciliation. Mock fill messages with `mt:25` are parsed through the same code path used by the live WebSocket handler.

## Tests

The agent test suite covers config validation, SIWE mock auth, whitelist handling, request-id persistence, WebSocket message encoding, fill reconciliation dispatch, deterministic decisions, path selection, and the scripted demo sequence.
