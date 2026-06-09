# Propmon

Propmon is a verifiable on-chain prop trading firm on Monad Testnet, powered by Perpl market data and trading infrastructure.

The product loop is:

```text
BUY_EXAM -> EXAMINATION -> PASS -> FUNDED -> PAYOUT
EXAMINATION -> FAIL -> BUY_EXAM
```

This repository is the Agent 00 foundation for the blitz build. It defines the shared repo layout, Monad/Perpl configuration, Solidity interface contracts, deploy ordering, demo-mode contract, and validation scripts that downstream agents build against.

## Repository Layout

```text
contracts/   Foundry project and shared Solidity interfaces
relayer/     TypeScript Perpl price relayer workspace
agent/       TypeScript trading client and agent loop workspace
web/         Next.js frontend scaffold
shared/      Address book, deployments, and demo configuration
docs/        Day-zero validation, demo-mode spec, and handoff notes
scripts/     Cross-workspace validation scripts
```

## Requirements

- Foundry `forge`
- Node.js 20+
- pnpm 10+
- Monad Testnet gas for deployments

Install dependencies:

```bash
pnpm install
```

## Common Commands

```bash
pnpm build          # TypeScript build plus Foundry build
pnpm test           # TypeScript checks plus forge test
pnpm dayzero:public # Public Perpl/Monad validation, no wallet required
pnpm relayer:dev    # Start relayer workspace in dev mode
pnpm agent:dev      # Start agent workspace in dev mode
pnpm web:dev        # Start Next.js app
```

Foundry-only commands:

```bash
cd contracts
forge build
forge test
```

## Environment

Copy `.env.example` to `.env` for local runs. Never commit secrets.

```bash
cp .env.example .env
```

Public validation needs no wallet. Perpl authenticated and account checks are intentionally env-gated:

- `OWNER_ADDRESS`
- `OWNER_PRIVATE_KEY`
- `PERPL_REF_CODE` if a referral code is available

If those variables are absent, the validation script records live Perpl trading as pending while still validating public REST, public WebSocket, and Monad RPC.

## Monad and Perpl

The canonical local source of truth is [shared/addresses.json](shared/addresses.json). It is populated from the live Perpl context endpoint, not from stale sprint notes.

Current verified testnet values:

- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- Perpl REST: `https://testnet.perpl.xyz/api`
- Perpl WebSocket: `wss://testnet.perpl.xyz`
- Perpl Exchange: `0x1964c32f0be608e7d29302aff5e61268e72080cc`
- Collateral: `AUSD` at `0xa9012a055bd4e0edff8ce09f960291c09d5322dc`, 6 decimals
- Markets: `BTC=16`, `ETH=32`, `SOL=48`, `MON=64`, `ZEC=256`

The public market-data WebSocket accepts `heartbeat@10143` and `market-state@10143`.

## Deployment

The fixed deployment order is:

```text
AccountRegistry -> RuleEngine -> PerplPriceAdapter -> ExaminationVault -> FundedVault
```

Run the deploy harness after owner implementations exist:

```bash
pnpm deploy:monad
```

The deploy script writes addresses into `shared/deployments.json`. Agent 00 ships only the harness and interface contract; downstream agents fill concrete implementations and constructor wiring.

## What Is Real vs Demo

The examination ledger is real on-chain in both live and demo mode. Examination entries and P&L are recorded against the same on-chain price adapter path.

Demo mode changes only:

- price source: deterministic seeded prices instead of live Perpl prices;
- pass timing: scripted entries can deterministically reach the profit target;
- funded execution: explicit demo fill entrypoints settle on-chain against adapter prices.

Demo fills and scripted prices must be visibly labeled as demo behavior. Core contracts do not contain a global demo switch.
