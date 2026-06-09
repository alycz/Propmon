// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAccountRegistry
/// @notice Owns account identity, authorized signers, and guarded state transitions.
interface IAccountRegistry {
    enum AccountState {
        NONE,
        EXAMINATION,
        PASSED,
        FUNDED,
        FAILED,
        PAYOUT
    }

    function ownerOf(uint256 accountId) external view returns (address);

    function isAuthorizedSigner(uint256 accountId, address signer) external view returns (bool);

    function stateOf(uint256 accountId) external view returns (AccountState);

    /// @notice Guarded by the registry owner/authorized vault implementations.
    function setState(uint256 accountId, AccountState state) external;
}
