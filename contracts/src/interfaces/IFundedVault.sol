// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccountView} from "./IAccountView.sol";

/// @title IFundedVault
/// @notice Funded-account lifecycle with explicit live Perpl intent and transparent demo fill paths.
interface IFundedVault is IAccountView {
    enum Side {
        LONG,
        SHORT
    }

    enum FillMode {
        LIVE,
        DEMO
    }

    event FundedAccountActivated(uint256 indexed accountId, address indexed owner);
    event LivePositionIntent(
        uint256 indexed accountId,
        uint256 indexed requestId,
        uint256 indexed marketId,
        Side side,
        int256 sizeDelta,
        uint256 collateral
    );
    event PositionFilled(
        uint256 indexed accountId,
        uint256 indexed requestId,
        uint256 indexed marketId,
        FillMode mode,
        int256 sizeDelta,
        uint256 fillPrice
    );
    event PayoutClaimed(uint256 indexed accountId, address indexed recipient, uint256 traderAmount, uint256 protocolAmount);

    /// @notice Activate a passed examination as a funded account.
    function activate(uint256 accountId) external;

    /// @notice Record an authorized live Perpl open-position intent for off-chain submission.
    function openPositionLive(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral)
        external
        returns (uint256 requestId);

    /// @notice Record an authorized live Perpl close-position intent for off-chain submission.
    function closePositionLive(uint256 accountId, uint256 marketId, int256 sizeDelta)
        external
        returns (uint256 requestId);

    /// @notice Settle a transparent demo open fill synchronously against the on-chain price adapter.
    function openPositionDemo(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral)
        external
        returns (uint256 fillPrice);

    /// @notice Settle a transparent demo close fill synchronously against the on-chain price adapter.
    function closePositionDemo(uint256 accountId, uint256 marketId, int256 sizeDelta)
        external
        returns (uint256 fillPrice);

    /// @notice Reconcile an asynchronous live Perpl fill back into on-chain accounting.
    function reconcileFill(uint256 accountId, uint256 requestId, uint256 marketId, int256 sizeDelta, uint256 fillPrice)
        external;

    /// @notice Claim trader/protocol profit split after funded-account completion.
    function payout(uint256 accountId, address recipient) external returns (uint256 traderAmount, uint256 protocolAmount);
}
