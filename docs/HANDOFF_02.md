# Handoff 02

Agent 02 deliverables are in place for the examination vault.

## Contract

`contracts/src/vaults/ExaminationVault.sol` implements `IExaminationVault` and `IAccountView` without changing shared interfaces.

Constructor:

```solidity
constructor(
    IAccountRegistry registry,
    IPerplPriceAdapter priceAdapter,
    IRuleEngine ruleEngine,
    uint256 maxPriceAge,
    uint256 defaultRuleTierId,
    address owner
)
```

## ABI Surface

Committed interface functions:

- `buyExamination(uint256 accountSize) payable returns (uint256 accountId)`
- `recordEntry(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral) returns (uint256 markPrice)`
- `resolve(uint256 accountId) returns (bool passed, bool failed)`
- `accountSnapshot(uint256 accountId) returns (balance, equity, peakEquity, dayStartEquity, openPositions, committedCollateral)`

Concrete dashboard views:

- `getAccount(uint256 accountId)`
- `getDrawdown(uint256 accountId) returns (uint256 dailyBps, uint256 totalBps)`
- `getEntries(uint256 accountId)`
- `getRuleStatus(uint256 accountId) returns (bool passed, bool failed)`
- `positionOf(uint256 accountId, uint256 marketId)`
- `activeMarketIds(uint256 accountId)`

Admin config:

- `setMarketSizeDecimals(uint256 marketId, uint8 sizeDecimals)`

Events:

- `ExaminationPurchased`
- `PaperEntryRecorded`
- `ExaminationResolved`
- `EntryRecorded`
- `ExaminationPassed`
- `ExaminationFailed`
- `MarketSizeDecimalsSet`

## Accounting Notes

- Exam fees are native Monad testnet currency: `accountSize * 100 / 10_000`.
- Account balance, equity, P&L, and collateral are 6-decimal quote units.
- Adapter prices are normalized to 18 decimals internally for weighted-average entry price and P&L math.
- Position sizes use per-market size decimals configured by `setMarketSizeDecimals`; MON defaults must be configured as `0` to match `shared/demo-config.json`.
- The UTC day boundary is `block.timestamp / 1 days`. `dayStartEquity` resets to pre-trade equity on the first accepted entry in a new UTC day bucket.
- Failure has priority if `IRuleEngine.evaluatePassFail` returns both `passed` and `failed`.
- `buyExamination` auto-registers the account with `IRuleEngine.configureAccount(accountId, defaultRuleTierId, address(this))`; the examination vault must have the rule engine's account-configuration authority in live deployments.

## Demo Confirmation

The scripted MON path from `shared/demo-config.json` is covered in `ExaminationVault.t.sol`:

- LONG `250000` MON at step 1
- LONG `125000` MON at step 3
- SHORT `-375000` MON at step 8

With the seeded test prices, realized P&L exceeds the 10% target on a `10000000000` account, and the vault resolves to `PASSED`.

## Integration Constraint

`IAccountRegistry` currently has no account-registration function. `ExaminationVault` therefore stores exam ownership locally and uses `IAccountRegistry` for authorized signer checks and guarded state transitions only. Agent 05 should either accept vault-created IDs via `setState` or add a coordinated registration API in a future shared-interface revision.
