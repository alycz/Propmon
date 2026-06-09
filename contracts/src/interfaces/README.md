# ProprietaryX Interfaces

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
