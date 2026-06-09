// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccountRegistry} from "../interfaces/IAccountRegistry.sol";

/// @title AccountRegistry
/// @notice Canonical Propmon account ownership, signer authorization, and guarded state.
contract AccountRegistry is IAccountRegistry, AccessControl {
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    uint256 public nextAccountId = 1;

    mapping(uint256 accountId => address owner) private owners;
    mapping(uint256 accountId => AccountState state) private states;
    mapping(uint256 accountId => mapping(address signer => bool authorized)) private authorizedSigners;

    error ZeroAddress();
    error UnknownAccount(uint256 accountId);
    error NotAccountOwner(uint256 accountId, address caller);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function register(address owner) external onlyRole(VAULT_ROLE) returns (uint256 accountId) {
        if (owner == address(0)) revert ZeroAddress();

        accountId = nextAccountId++;
        owners[accountId] = owner;
        states[accountId] = AccountState.EXAMINATION;

        emit AccountRegistered(accountId, owner);
        emit StateChanged(accountId, AccountState.NONE, AccountState.EXAMINATION);
    }

    function ownerOf(uint256 accountId) external view returns (address) {
        return owners[accountId];
    }

    function isAuthorizedSigner(uint256 accountId, address signer) external view returns (bool) {
        address owner = owners[accountId];
        if (owner == address(0)) return false;
        return signer == owner || authorizedSigners[accountId][signer];
    }

    function stateOf(uint256 accountId) external view returns (AccountState) {
        return states[accountId];
    }

    function authorizeSigner(uint256 accountId, address signer) external {
        if (signer == address(0)) revert ZeroAddress();
        _requireOwner(accountId);

        authorizedSigners[accountId][signer] = true;
        emit SignerAuthorized(accountId, signer);
    }

    function revokeSigner(uint256 accountId, address signer) external {
        if (signer == address(0)) revert ZeroAddress();
        _requireOwner(accountId);

        authorizedSigners[accountId][signer] = false;
        emit SignerRevoked(accountId, signer);
    }

    function setState(uint256 accountId, AccountState state) external onlyRole(VAULT_ROLE) {
        _requireKnownAccount(accountId);

        AccountState previous = states[accountId];
        states[accountId] = state;
        emit StateChanged(accountId, previous, state);
    }

    function _requireOwner(uint256 accountId) private view {
        _requireKnownAccount(accountId);
        if (msg.sender != owners[accountId]) revert NotAccountOwner(accountId, msg.sender);
    }

    function _requireKnownAccount(uint256 accountId) private view {
        if (owners[accountId] == address(0)) revert UnknownAccount(accountId);
    }
}
