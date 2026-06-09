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

    event AccountRegistered(uint256 indexed accountId, address indexed owner);
    event SignerAuthorized(uint256 indexed accountId, address indexed signer);
    event SignerRevoked(uint256 indexed accountId, address indexed signer);
    event StateChanged(uint256 indexed accountId, AccountState from, AccountState to);

    function register(address owner) external returns (uint256 accountId);

    function ownerOf(uint256 accountId) external view returns (address);

    function isAuthorizedSigner(uint256 accountId, address signer) external view returns (bool);

    function stateOf(uint256 accountId) external view returns (AccountState);

    function authorizeSigner(uint256 accountId, address signer) external;

    function revokeSigner(uint256 accountId, address signer) external;

    /// @notice Guarded by the registry owner/authorized vault implementations.
    function setState(uint256 accountId, AccountState state) external;
}
