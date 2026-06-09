# Handoff 03

Agent 03 deliverables are in place for the rule engine.

## Contract

`contracts/src/rules/RuleEngine.sol` implements `IRuleEngine` with OpenZeppelin `AccessControl`.

Roles:

- `DEFAULT_ADMIN_ROLE`: grants and revokes roles.
- `RULE_ADMIN_ROLE`: updates tier rule sets.
- `ACCOUNT_CONFIG_ROLE`: registers accounts to a tier and account-view contract.

Constructor:

```solidity
constructor(address admin)
```

The constructor configures demo tier `1` for a 10k examination account:

- `profitTargetBps`: `1000`
- `maxDailyDrawdownBps`: `500`
- `maxTotalDrawdownBps`: `1000`
- `maxLeverageX`: `25`
- `maxNotional`: `250000000000`
- `maxOpenPositions`: `3`

The `25x` demo leverage cap intentionally allows the scripted MON pass in `shared/demo-config.json`, whose opening trades are about `20.8x`.

## Account Registration Flow

Vaults must call:

```solidity
configureAccount(uint256 accountId, uint256 tierId, address accountView)
```

`accountView` must implement `IAccountView.accountSnapshot`. `ExaminationVault.buyExamination` now auto-registers each new account with its constructor-provided default rule tier. Funded-vault activation should follow the same pattern and must be granted `ACCOUNT_CONFIG_ROLE`.

`contracts/script/Deploy.s.sol` deploys `RuleEngine` and grants `ACCOUNT_CONFIG_ROLE` to `EXAMINATION_VAULT_ADDRESS` and `FUNDED_VAULT_ADDRESS` when those env vars are supplied.

## TradeCheckInput

Vaults should call `checkTradeDetailed(TradeCheckInput)` for new integrations. The legacy `checkTrade(accountId, sizeDelta, collateral, markPrice)` selector remains for compatibility.

`TradeCheckInput` expectations:

- `markPrice` and `priceDecimals` are the raw values returned by `IPerplPriceAdapter.getPrice`.
- `sizeDecimals` is the Perpl market size-decimal setting used by the vault.
- `opensNewPosition` must be true only when the trade opens a new active market position.
- `collateral`, notional, equity, balance, and drawdown values are 6-decimal quote units.

Reason strings are stable for frontend/demo use:

- `ACCOUNT_NOT_CONFIGURED`
- `RULESET_NOT_CONFIGURED`
- `MAX_NOTIONAL`
- `MAX_LEVERAGE`
- `MAX_CONCENTRATION`
- `CAPITAL_DEPLOYED`

## Pass/Fail Resolution

`evaluatePassFail(accountId)` reads `IAccountView.accountSnapshot` and applies:

- pass when `equity >= balance * (1 + profitTargetBps)`;
- fail when daily drawdown is above `maxDailyDrawdownBps`;
- fail when total drawdown is above `maxTotalDrawdownBps`;
- failure wins if both pass and fail conditions are true.

Pure pre-trade blocking cannot catch a drawdown breach while a funded position sits idle. The examination phase is fully enforced (vault owns the ledger). The funded phase enforces drawdown-at-trade-time and documents idle-breach monitoring via a watcher service as a roadmap item.

## Validation

Run:

```bash
forge test --root contracts
```

Current result: 28 tests passed.
