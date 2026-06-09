// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccountView} from "./IAccountView.sol";

/// @title IExaminationVault
/// @notice Handles exam purchase, paper trading entries, resolution, and account views.
interface IExaminationVault is IAccountView {
    enum Side {
        LONG,
        SHORT
    }

    event ExaminationPurchased(uint256 indexed accountId, address indexed owner, uint256 accountSize, uint256 feePaid);
    event PaperEntryRecorded(
        uint256 indexed accountId,
        uint256 indexed marketId,
        address indexed signer,
        Side side,
        int256 sizeDelta,
        uint256 collateral,
        uint256 markPrice
    );
    event ExaminationResolved(uint256 indexed accountId, bool passed, bool failed);

    /// @notice Buy a new examination for a requested notional account size.
    function buyExamination(uint256 accountSize) external payable returns (uint256 accountId);

    /// @notice Record an on-chain paper entry after registry authorization and rule checks.
    function recordEntry(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral)
        external
        returns (uint256 markPrice);

    /// @notice Evaluate the account against rule-engine pass/fail criteria and update registry state.
    function resolve(uint256 accountId) external returns (bool passed, bool failed);
}
