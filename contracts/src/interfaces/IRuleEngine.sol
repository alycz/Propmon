// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IRuleEngine
/// @notice Pre-trade risk checks and pass/fail evaluation for examination and funded flows.
interface IRuleEngine {
    struct RuleSet {
        uint256 profitTargetBps;
        uint256 maxDailyDrawdownBps;
        uint256 maxTotalDrawdownBps;
        uint256 maxLeverageX;
        uint256 maxNotional;
        uint256 maxOpenPositions;
    }

    struct TradeCheckInput {
        uint256 accountId;
        uint256 marketId;
        int256 sizeDelta;
        uint256 collateral;
        uint256 markPrice;
        uint8 priceDecimals;
        uint8 sizeDecimals;
        bool opensNewPosition;
    }

    function configureAccount(uint256 accountId, uint256 tierId, address accountView) external;

    function setRuleSet(uint256 tierId, RuleSet calldata ruleSet) external;

    function getRuleSetForTier(uint256 tierId) external view returns (RuleSet memory);

    function getRuleSetForAccount(uint256 accountId) external view returns (RuleSet memory);

    function checkTradeDetailed(TradeCheckInput calldata input) external view returns (bool ok, string memory reason);

    function checkTrade(uint256 accountId, int256 sizeDelta, uint256 collateral, uint256 markPrice)
        external
        view
        returns (bool ok, string memory reason);

    function evaluatePassFail(uint256 accountId) external view returns (bool passed, bool failed);
}
