// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAccountView
/// @notice Read interface implemented by vaults for rule-engine evaluation.
interface IAccountView {
    function accountSnapshot(uint256 accountId)
        external
        view
        returns (
            uint256 balance,
            uint256 equity,
            uint256 peakEquity,
            uint256 dayStartEquity,
            uint256 openPositions,
            uint256 committedCollateral
        );
}
