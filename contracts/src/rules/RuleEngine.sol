// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccountView} from "../interfaces/IAccountView.sol";
import {IRuleEngine} from "../interfaces/IRuleEngine.sol";

/// @title RuleEngine
/// @notice On-chain Propmon pre-trade risk checks and pass/fail resolution.
contract RuleEngine is IRuleEngine, AccessControl {
    bytes32 public constant RULE_ADMIN_ROLE = keccak256("RULE_ADMIN_ROLE");
    bytes32 public constant ACCOUNT_CONFIG_ROLE = keccak256("ACCOUNT_CONFIG_ROLE");

    uint256 public constant BPS = 10_000;
    uint8 public constant QUOTE_DECIMALS = 6;
    uint256 private constant PRICE_UNIT = 1e18;

    uint256 public constant DEMO_TIER_ID = 1;

    string public constant ACCOUNT_NOT_CONFIGURED = "ACCOUNT_NOT_CONFIGURED";
    string public constant RULESET_NOT_CONFIGURED = "RULESET_NOT_CONFIGURED";
    string public constant MAX_NOTIONAL = "MAX_NOTIONAL";
    string public constant MAX_LEVERAGE = "MAX_LEVERAGE";
    string public constant MAX_CONCENTRATION = "MAX_CONCENTRATION";
    string public constant CAPITAL_DEPLOYED = "CAPITAL_DEPLOYED";

    struct AccountConfig {
        uint256 tierId;
        IAccountView accountView;
    }

    mapping(uint256 tierId => RuleSet ruleSet) private ruleSets;
    mapping(uint256 tierId => bool configured) private ruleSetConfigured;
    mapping(uint256 accountId => AccountConfig config) private accountConfigs;

    event RuleSetUpdated(uint256 indexed tierId, RuleSet ruleSet);
    event AccountConfigured(uint256 indexed accountId, uint256 indexed tierId, address indexed accountView);

    error ZeroAddress();
    error InvalidAccount(uint256 accountId);
    error InvalidTier(uint256 tierId);
    error InvalidDecimals(uint8 decimals);
    error InvalidSizeDelta();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RULE_ADMIN_ROLE, admin);
        _grantRole(ACCOUNT_CONFIG_ROLE, admin);

        _setRuleSet(
            DEMO_TIER_ID,
            RuleSet({
                profitTargetBps: 1_000,
                maxDailyDrawdownBps: 500,
                maxTotalDrawdownBps: 1_000,
                maxLeverageX: 25,
                maxNotional: 250_000_000_000,
                maxOpenPositions: 3
            })
        );
    }

    function configureAccount(uint256 accountId, uint256 tierId, address accountView)
        external
        onlyRole(ACCOUNT_CONFIG_ROLE)
    {
        _configureAccount(accountId, tierId, accountView);
    }

    function setRuleSet(uint256 tierId, RuleSet calldata ruleSet) external onlyRole(RULE_ADMIN_ROLE) {
        _setRuleSet(tierId, ruleSet);
    }

    function getRuleSetForTier(uint256 tierId) external view returns (RuleSet memory) {
        return ruleSets[tierId];
    }

    function getRuleSetForAccount(uint256 accountId) external view returns (RuleSet memory) {
        AccountConfig memory config = accountConfigs[accountId];
        return ruleSets[config.tierId];
    }

    function checkTradeDetailed(TradeCheckInput calldata input) external view returns (bool ok, string memory reason) {
        AccountConfig memory config = accountConfigs[input.accountId];
        if (address(config.accountView) == address(0)) return (false, ACCOUNT_NOT_CONFIGURED);
        if (!ruleSetConfigured[config.tierId]) return (false, RULESET_NOT_CONFIGURED);

        RuleSet memory ruleSet = ruleSets[config.tierId];
        (uint256 balance, uint256 equity,,, uint256 openPositions, uint256 committedCollateral) =
            config.accountView.accountSnapshot(input.accountId);

        if (equity == 0 || balance == 0) return (false, CAPITAL_DEPLOYED);

        uint256 newCommittedCollateral = committedCollateral + input.collateral;
        if (newCommittedCollateral > equity) return (false, CAPITAL_DEPLOYED);

        if (input.opensNewPosition && openPositions >= ruleSet.maxOpenPositions) {
            return (false, MAX_CONCENTRATION);
        }

        uint256 notional = _notional(input.sizeDelta, input.markPrice, input.priceDecimals, input.sizeDecimals);
        if (ruleSet.maxNotional > 0 && notional > ruleSet.maxNotional) return (false, MAX_NOTIONAL);

        uint256 leverageDenominator = input.collateral == 0 ? equity : input.collateral;
        if (ruleSet.maxLeverageX > 0 && notional > leverageDenominator * ruleSet.maxLeverageX) {
            return (false, MAX_LEVERAGE);
        }

        return (true, "");
    }

    function checkTrade(uint256 accountId, int256 sizeDelta, uint256 collateral, uint256 markPrice)
        external
        view
        returns (bool ok, string memory reason)
    {
        TradeCheckInput memory input = TradeCheckInput({
            accountId: accountId,
            marketId: 0,
            sizeDelta: sizeDelta,
            collateral: collateral,
            markPrice: markPrice,
            priceDecimals: QUOTE_DECIMALS,
            sizeDecimals: 0,
            opensNewPosition: false
        });
        return this.checkTradeDetailed(input);
    }

    function evaluatePassFail(uint256 accountId) external view returns (bool passed, bool failed) {
        AccountConfig memory config = accountConfigs[accountId];
        if (address(config.accountView) == address(0) || !ruleSetConfigured[config.tierId]) return (false, false);

        RuleSet memory ruleSet = ruleSets[config.tierId];
        (uint256 balance, uint256 equity, uint256 peakEquity, uint256 dayStartEquity,,) =
            config.accountView.accountSnapshot(accountId);

        uint256 dailyDrawdownBps = _drawdownBps(dayStartEquity, equity);
        uint256 totalDrawdownBps = _drawdownBps(peakEquity, equity);

        failed = dailyDrawdownBps > ruleSet.maxDailyDrawdownBps || totalDrawdownBps > ruleSet.maxTotalDrawdownBps;
        if (failed) return (false, true);

        uint256 targetEquity = balance + ((balance * ruleSet.profitTargetBps) / BPS);
        passed = equity >= targetEquity;
    }

    function _configureAccount(uint256 accountId, uint256 tierId, address accountView) private {
        if (accountId == 0) revert InvalidAccount(accountId);
        if (accountView == address(0)) revert ZeroAddress();
        if (!ruleSetConfigured[tierId]) revert InvalidTier(tierId);

        accountConfigs[accountId] = AccountConfig({tierId: tierId, accountView: IAccountView(accountView)});
        emit AccountConfigured(accountId, tierId, accountView);
    }

    function _setRuleSet(uint256 tierId, RuleSet memory ruleSet) private {
        if (tierId == 0) revert InvalidTier(tierId);

        ruleSets[tierId] = ruleSet;
        ruleSetConfigured[tierId] = true;
        emit RuleSetUpdated(tierId, ruleSet);
    }

    function _notional(int256 sizeDelta, uint256 markPrice, uint8 priceDecimals, uint8 sizeDecimals)
        private
        pure
        returns (uint256)
    {
        if (priceDecimals > 18) revert InvalidDecimals(priceDecimals);
        if (sizeDecimals > 18) revert InvalidDecimals(sizeDecimals);

        uint256 markPriceX18 = _normalizePrice(markPrice, priceDecimals);
        uint256 sizeAbs = _abs(sizeDelta);
        uint256 sizeUnit = 10 ** sizeDecimals;
        return (sizeAbs * markPriceX18 * (10 ** QUOTE_DECIMALS)) / (sizeUnit * PRICE_UNIT);
    }

    function _normalizePrice(uint256 price, uint8 decimals) private pure returns (uint256) {
        if (decimals == 18) return price;
        if (decimals < 18) return price * (10 ** (18 - decimals));
        return price / (10 ** (decimals - 18));
    }

    function _drawdownBps(uint256 referenceEquity, uint256 equity) private pure returns (uint256) {
        if (referenceEquity == 0 || equity >= referenceEquity) return 0;
        return ((referenceEquity - equity) * BPS) / referenceEquity;
    }

    function _abs(int256 value) private pure returns (uint256) {
        if (value == type(int256).min) revert InvalidSizeDelta();
        return uint256(value >= 0 ? value : -value);
    }
}
