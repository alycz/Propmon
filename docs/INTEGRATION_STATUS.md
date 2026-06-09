# Integration Status

Date: 2026-06-09

## Current Verdict

- Unit and contract baseline: GO after `pnpm install --frozen-lockfile`; `pnpm test` passes locally.
- Monad Testnet E2E: PENDING until the full deploy script is broadcast and `shared/deployments.json` contains real addresses.
- Demo funded path: GO by implementation, but the deployed `FundedVault` must hold enough Monad Testnet AUSD before activation and payout.
- Live funded Perpl trading: PENDING/NO-GO until a whitelisted wallet validates authenticated Perpl trading.

## Deployment Checklist

Run:

```bash
OWNER_PRIVATE_KEY=0x... \
OWNER_ADDRESS=0x... \
RELAYER_ADDRESS=0x... \
RECONCILER_ADDRESS=0x... \
PROTOCOL_TREASURY=0x... \
pnpm deploy:monad
```

The deploy harness now deploys and writes:

- `AccountRegistry`: PENDING
- `RuleEngine`: PENDING
- `PerplPriceAdapter`: PENDING
- `ExaminationVault`: PENDING
- `FundedVault`: PENDING

Default settlement token is Perpl Monad Testnet AUSD:

```text
0xa9012a055bd4e0edff8ce09f960291c09d5322dc
```

## Demo Smoke Checklist

Run after deployment:

```bash
OWNER_PRIVATE_KEY=0x... \
AGENT_PRIVATE_KEY=0x... \
RELAYER_PRIVATE_KEY=0x... \
pnpm smoke:demo
```

Expected flow:

- Push deterministic demo prices to `PerplPriceAdapter`.
- Buy a `$10,000` examination and log the tx hash.
- Authorize the agent signer and log the tx hash.
- Confirm a rule-breaching paper trade is rejected.
- Execute scripted MON paper entries on-chain.
- Resolve to `PASSED`.
- Verify or transfer AUSD liquidity to `FundedVault`.
- Activate funded account.
- Open and close one labeled demo funded position.
- Claim on-chain profit-split payout.

Latest smoke result is written to:

```text
.context/integration-smoke-last.json
```

## Live Smoke Checklist

Run after deployment:

```bash
OWNER_PRIVATE_KEY=0x... \
RELAYER_PRIVATE_KEY=0x... \
pnpm smoke:live
```

Expected flow:

- Pull current Perpl REST context.
- Push live mark prices into `PerplPriceAdapter`.
- Record whitelist/auth status.
- Keep funded live execution marked PENDING/NO-GO unless a whitelisted wallet completes Perpl authenticated trading.

## Agent API

Start the API used by the frontend `Run demo script` button:

```bash
AGENT_PRIVATE_KEY=0x... \
AGENT_ACCOUNT_ID=1 \
NEXT_PUBLIC_AGENT_API_URL=http://127.0.0.1:8787 \
pnpm agent:server
```

Endpoint:

```http
POST /demo-script
content-type: application/json
x-propmon-mode: demo

{"mode":"demo","accountId":"1"}
```

The endpoint only runs demo mode and requires the agent key to be authorized for the submitted account.

## Submission Placeholders

- Public Vercel URL: PENDING project deployment/access.
- Demo video URL: PENDING after successful `pnpm smoke:demo`.
- MonadScan links: PENDING deployment tx hashes.
- Perpl live verdict: PENDING whitelist validation; demo-funded path remains the guaranteed stage path.
