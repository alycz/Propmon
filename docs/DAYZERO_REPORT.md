# Day-Zero Report

Date: 2026-06-09

## Verdict

- Examination phase: GO. It depends only on public Perpl market data and Monad on-chain accounting.
- Funded live Perpl trading: PENDING/NO-GO until a whitelisted wallet validates Perpl SIWE auth and on-chain account creation.
- Demo funded path: GO by architecture. It uses explicit demo fill entrypoints and remains visibly labeled.

## Public REST Context

Validated endpoint:

```text
https://testnet.perpl.xyz/api/v1/pub/context
```

Observed live values:

- Chain: Monad Testnet, `chain_id=10143`
- Block explorer: `https://testnet.monadscan.com/`
- Exchange instance: `id=12`
- Exchange address: `0x1964c32f0be608e7d29302aff5e61268e72080cc`
- Minimum account open amount: `100000000`
- Minimum deposit amount: `10000000`
- Collateral: `AUSD`, address `0xa9012a055bd4e0edff8ce09f960291c09d5322dc`, decimals `6`

Important correction: the sprint brief listed stale collateral `0xdf5b718d8fcc173335185a2a1513ee8151e3c027`. The live Perpl context currently reports `0xa9012a055bd4e0edff8ce09f960291c09d5322dc`, and the repo address book uses the live value.

Observed markets:

| Symbol | Market ID | Price Decimals | Size Decimals | Initial Margin |
| --- | ---: | ---: | ---: | ---: |
| BTC | 16 | 1 | 5 | 1000 |
| ETH | 32 | 2 | 3 | 1000 |
| SOL | 48 | 2 | 3 | 1000 |
| MON | 64 | 5 | 0 | 300 |
| ZEC | 256 | 3 | 3 | 300 |

## Public WebSocket

Validated endpoint:

```text
wss://testnet.perpl.xyz/ws/v1/market-data
```

Working subscriptions:

- `heartbeat@10143`
- `market-state@10143`

Observed quirk: `market-state@` and `market-state@16` returned `404 unknown stream`; relayer should subscribe to the chain-scoped `market-state@10143` stream and then read market IDs from the update payload.

## Monad RPC

Validated endpoint:

```text
https://testnet-rpc.monad.xyz
```

`eth_chainId` returned `0x279f`, which is decimal `10143`.

## Whitelist and Account Creation

Perpl authenticated trading requires a whitelisted wallet. Agent 00 provides an env-gated validation script and does not commit wallet material.

Required env vars for future authenticated checks:

- `OWNER_ADDRESS`
- `OWNER_PRIVATE_KEY`
- `PERPL_REF_CODE` if available

Without those values, live funded trading remains PENDING/NO-GO and the demo funded path is the required stage fallback.

## Faucet Path

- Monad testnet gas: use the official Monad faucet path linked from Monad docs or Monad testnet explorer.
- Perpl collateral: use the Perpl testnet UI at `https://testnet.perpl.xyz` after connecting the wallet; confirm current token and minimum deposit from `/v1/pub/context`.

The address book should be regenerated or manually rechecked before a live demo because Perpl testnet values can move.
