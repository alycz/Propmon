# Handoff 04

Agent 04 deliverables are in place for the funded vault.

## Contract

`contracts/src/vaults/FundedVault.sol` implements `IFundedVault` and `IAccountView` without changing the shared ABI.

Constructor:

```solidity
constructor(
    IAccountRegistry registry,
    IAccountView examinationVault,
    IPerplPriceAdapter priceAdapter,
    IRuleEngine ruleEngine,
    IERC20 settlementToken,
    address protocolTreasury,
    uint256 maxPriceAge,
    uint256 traderShareBps,
    address admin,
    address reconciler
)
```

Roles:

- `DEFAULT_ADMIN_ROLE`: configures market size decimals and manages roles.
- `RECONCILER_ROLE`: held by the backend/Perpl client; can reconcile or cancel live orders.

## ABI Surface

Committed interface functions:

- `activate(uint256 accountId)`
- `openPositionLive(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral) returns (uint256 requestId)`
- `closePositionLive(uint256 accountId, uint256 marketId, int256 sizeDelta) returns (uint256 requestId)`
- `openPositionDemo(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral) returns (uint256 fillPrice)`
- `closePositionDemo(uint256 accountId, uint256 marketId, int256 sizeDelta) returns (uint256 fillPrice)`
- `reconcileFill(uint256 accountId, uint256 requestId, uint256 marketId, int256 sizeDelta, uint256 fillPrice)`
- `payout(uint256 accountId, address recipient) returns (uint256 traderAmount, uint256 protocolAmount)`
- `accountSnapshot(uint256 accountId) returns (balance, equity, peakEquity, dayStartEquity, openPositions, committedCollateral)`

Concrete dashboard/client views:

- `getAccount(uint256 accountId)`
- `getOrder(uint256 accountId, uint256 requestId)`
- `getDrawdown(uint256 accountId) returns (uint256 dailyBps, uint256 totalBps)`
- `positionOf(uint256 accountId, uint256 marketId)`
- `activeMarketIds(uint256 accountId)`

Admin/reconciler operations:

- `setMarketSizeDecimals(uint256 marketId, uint8 sizeDecimals)`
- `cancelOrder(uint256 accountId, uint256 requestId)`

## Order And Fill Flow

Order status enum:

```solidity
enum OrderStatus {
    NONE,
    PENDING,
    FILLED,
    CANCELLED
}
```

Live mode records an on-chain intent and waits for Agent 06:

1. Owner or authorized signer calls `openPositionLive` or `closePositionLive`.
2. Vault fetches a fresh adapter mark, calls `IRuleEngine.checkTrade`, stores a `PENDING` order, and emits `LivePositionIntent`.
3. Agent 06 submits the matching Perpl WS order.
4. Backend reconciler calls `reconcileFill(accountId, requestId, marketId, sizeDelta, fillPrice)`.
5. Vault marks the order `FILLED`, applies accounting, and emits `PositionFilled(..., FillMode.LIVE, ...)`.

Demo mode is synchronous and fully on-chain:

1. Owner or authorized signer calls `openPositionDemo` or `closePositionDemo`.
2. Vault uses the same auth, fresh price, and rule-check path.
3. Vault applies the fill immediately against `IPerplPriceAdapter.getPrice`.
4. Vault emits `PositionFilled(..., FillMode.DEMO, ...)` and `DemoFill`.

Demo fills must be labeled as demo fills in the UI and video. They are not Perpl executions.

## Accounting Notes

- Funded balances, equity, P&L, collateral, and payouts are 6-decimal quote units.
- `activate` reads the funded size from `examinationVault.accountSnapshot(accountId).balance`.
- The vault must already hold enough settlement token to reserve the funded account size.
- P&L math follows `ExaminationVault`: normalized 18-decimal prices, per-market size decimals, weighted average entry, realized/unrealized P&L, committed collateral, active-market tracking, and UTC day buckets.
- `payout` requires no open positions, no pending live orders, and positive profit. It pays only profit, using `traderShareBps` for the trader share and sending the remainder to `protocolTreasury`.
- The funded principal remains reserved in the vault after payout.

## Integration Status

Live Perpl execution remains PENDING/NO-GO until authenticated Perpl account creation and whitelist status are confirmed. The live on-chain side is ready for Agent 06 through `LivePositionIntent` and `reconcileFill`.

Demo funded execution is GO. It requires no Perpl whitelist and settles on-chain through the price adapter.

Deploy wiring is deferred until concrete `AccountRegistry` and `RuleEngine` implementations land. Use the AUSD settlement token from `shared/addresses.json`, `traderShareBps = 8000`, and grant `RECONCILER_ROLE` to the backend key.

## Validation

Run:

```bash
pnpm install --frozen-lockfile
forge test --root contracts
```
