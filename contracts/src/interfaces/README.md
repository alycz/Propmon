# Propmon Interfaces

These interfaces are the shared contract between all implementation agents. Treat signature changes as breaking.

## Data Flow

```text
Vault
  -> AccountRegistry: owner, authorized signer, current account state
  -> PerplPriceAdapter: on-chain market price
  -> RuleEngine.checkTrade: pre-trade risk decision
  -> Vault ledger/accounting update
  -> RuleEngine.evaluatePassFail: examination resolution
  -> AccountRegistry.setState: guarded state transition
```

The examination vault and funded vault both implement `IAccountView` so the rule engine can evaluate current account state without owning vault storage.

## Demo Mode Boundary

Core contracts do not expose a global demo switch. Demo behavior is selected by the caller:

- live funded flow uses `openPositionLive` / `closePositionLive` and later `reconcileFill`;
- demo funded flow uses `openPositionDemo` / `closePositionDemo` and settles transparently against `IPerplPriceAdapter`.

Both paths must check the same authorization and rule-engine guard.

## Price Adapter Convention

`IPerplPriceAdapter.getPrice(marketId)` returns the latest on-chain Perpl mark price as a scaled integer plus the explicit decimal count used for that market. The current Monad Testnet mapping and decimals live in `shared/addresses.json`.

Vaults should read only `getPrice` and `isStale`. The relayer writes through the concrete `PerplPriceAdapter.pushPrice` function, which is intentionally not part of the vault-facing interface.
