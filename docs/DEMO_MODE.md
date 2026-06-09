# Demo Mode

Demo mode is an honest presentation path for the full Propmon loop when Perpl whitelist or matching timing is unavailable.

## Mode Selection

Mode is a single value:

```text
live | demo
```

- Frontend: React state plus `?mode=live` or `?mode=demo`.
- Backend, relayer, and agent: `PROPMON_MODE`, with per-request override when supplied by the frontend.
- Contracts: no global demo switch.

Do not use browser storage for mode persistence.

## Live Mode

- Price source: live Perpl public REST/WS data pushed through `IPerplPriceAdapter`.
- Examination: real on-chain paper entries and P&L.
- Pass/fail: evaluated by `IRuleEngine`.
- Funded execution: `openPositionLive` or `closePositionLive` records an on-chain intent; the off-chain client submits authenticated Perpl WS orders; `reconcileFill` records fills on-chain.

## Demo Mode

- Price source: deterministic seeded price series from `shared/demo-config.json`, pushed through the same `IPerplPriceAdapter`.
- Examination: same on-chain path as live mode.
- Pass trigger: scripted entries can deterministically reach the profit target.
- Funded execution: `openPositionDemo` and `closePositionDemo` settle synchronously on-chain against adapter prices.
- UI label: funded fills must be labeled `DEMO FILL`; scripted prices must be labeled as demo prices.

## Honesty Rule

The examination ledger is real on-chain in both modes. Demo mode only changes the price source and funded-fill mechanism. Demo fills must never be represented as real Perpl executions.

## Fallback Policy

If mode is `live` but Perpl auth is unavailable, not whitelisted, or account creation has not been confirmed, route funded execution to the demo path and surface that status in the UI. Do not block the examination flow.
