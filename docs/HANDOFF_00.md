# Handoff 00

Agent 00 deliverables are in place for downstream implementation agents.

## Shared Interfaces

Interface files live in `contracts/src/interfaces`:

- `IAccountRegistry`
- `IPerplPriceAdapter`
- `IRuleEngine`
- `IAccountView`
- `IExaminationVault`
- `IFundedVault`

Treat signature changes as breaking and coordinate before editing these files.

## Address Sources

- Static address book: `shared/addresses.json`
- Deployed ProprietaryX addresses: `shared/deployments.json`
- Demo parameters: `shared/demo-config.json`

Perpl testnet values were checked against `/v1/pub/context`. The live collateral token is currently `AUSD` at `0xa9012a055bd4e0edff8ce09f960291c09d5322dc`.

## Perpl Quirks

- Public market data uses `wss://testnet.perpl.xyz/ws/v1/market-data`.
- Chain-scoped market state stream is `market-state@10143`.
- `market-state@` and `market-state@16` returned `404 unknown stream` during Agent 00 checks.
- Authenticated endpoints and trading WebSocket require a whitelisted wallet.
- API auth and smart-contract account creation are separate steps.

## Funded Verdict

Live funded Perpl trading is PENDING/NO-GO until a whitelisted wallet validates SIWE auth and `createAccount`.

Demo funded flow is GO by design through explicit demo fill entrypoints on `IFundedVault`.

## Deploy Harness

`contracts/script/Deploy.s.sol` fixes deploy order and JSON write-out. Concrete contract deployments and constructor wiring remain owned by Agents 01-05.

## Validation

Run:

```bash
pnpm dayzero:public
pnpm test
```

`pnpm dayzero:public` validates public REST, public WS, and Monad RPC without secrets.
