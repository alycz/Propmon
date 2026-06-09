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

    function checkTrade(uint256 accountId, int256 sizeDelta, uint256 collateral, uint256 markPrice)
        external
        view
        returns (bool ok, string memory reason);

    function evaluatePassFail(uint256 accountId) external view returns (bool passed, bool failed);
}
