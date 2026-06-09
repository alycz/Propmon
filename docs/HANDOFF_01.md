# Handoff 01

Agent 01 deliverables are in place for the Perpl price adapter and relayer.

## Contract ABI

Concrete adapter: `contracts/src/oracle/PerplPriceAdapter.sol`

Vault-facing interface:

```solidity
function getPrice(uint256 marketId)
    external
    view
    returns (uint256 price, uint8 decimals, uint256 updatedAt);

function isStale(uint256 marketId, uint256 maxAge) external view returns (bool);
```

Relayer write API on the concrete adapter:

```solidity
function pushPrice(uint256 marketId, uint256 price, uint8 decimals) external;
```

Only accounts with `RELAYER_ROLE` can call `pushPrice`. The deploy script grants `RELAYER_ROLE` to `RELAYER_ADDRESS` when set, otherwise to the deployer for local/dev runs.

## Price Convention

The adapter stores one latest mark per Perpl market:

- `price`: scaled unsigned integer
- `decimals`: explicit decimal scale for that market
- `updatedAt`: block timestamp of the latest accepted update

Scaling uses `shared/addresses.json` `perpl.markets[*].priceDecimals`.

Current Monad Testnet mapping:

| Symbol | Market ID | Price Decimals |
| --- | ---: | ---: |
| BTC | 16 | 1 |
| ETH | 32 | 2 |
| SOL | 48 | 2 |
| MON | 64 | 5 |
| ZEC | 256 | 3 |

Example: MON `0.02083` with `5` decimals is pushed as `2083`.

## Relayer

Package: `relayer`

Required env vars for submitting price transactions:

```bash
PRICE_ADAPTER_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
PROPMON_MODE=demo # or live
```

Optional tuning:

```bash
PERPL_API_URL=https://testnet.perpl.xyz/api
PERPL_WS_URL=wss://testnet.perpl.xyz
PERPL_CHAIN_ID=10143
PRICE_PUSH_INTERVAL_MS=5000
PRICE_MIN_MOVE_BPS=5
PRICE_POLL_INTERVAL_MS=10000
PRICE_RECONNECT_BASE_MS=1000
```

Run demo mode:

```bash
PROPMON_MODE=demo pnpm relayer:dev
```

Run live mode:

```bash
PROPMON_MODE=live pnpm relayer:dev
```

Both modes call the same on-chain `pushPrice` function. Demo mode only swaps the number source to the deterministic seeded series in `shared/demo-config.json`.

## Live Perpl Source

The relayer connects to:

```text
wss://testnet.perpl.xyz/ws/v1/market-data
```

It subscribes with `mt: 5` to:

```text
heartbeat@10143
market-state@10143
```

Market-state messages are `mt: 9`. The relayer filters configured market IDs from the payload and uses `mrk` as the canonical mark price. `orl` is parsed only as fallback metadata when no mark is present. REST fallback polls:

```text
https://testnet.perpl.xyz/api/v1/pub/context
```

Known Perpl quirk from Agent 00: `market-state@` and per-market streams such as `market-state@16` returned `404 unknown stream`; use chain-scoped `market-state@10143`.

## Staleness

`isStale(marketId, maxAge)` returns true when:

- no price has ever been pushed for `marketId`; or
- `block.timestamp > updatedAt + maxAge`.

Vaults should reject new trades when `isStale` is true. Recommended defaults are strict in live mode and more generous for stage demo timing.

## Validation

Run:

```bash
pnpm --filter @propmon/relayer test
forge test --root contracts
pnpm test
```
