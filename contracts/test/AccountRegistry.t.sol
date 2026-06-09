// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccountRegistry} from "../src/interfaces/IAccountRegistry.sol";
import {AccountRegistry} from "../src/registry/AccountRegistry.sol";

contract AccountRegistryTest is Test {
    address private admin = address(0xA11CE);
    address private vault = address(0xCAFE);
    address private owner = address(0xB0B);
    address private signer = address(0xD00D);
    address private stranger = address(0xE0A);

    AccountRegistry private registry;

    event AccountRegistered(uint256 indexed accountId, address indexed owner);
    event SignerAuthorized(uint256 indexed accountId, address indexed signer);
    event SignerRevoked(uint256 indexed accountId, address indexed signer);
    event StateChanged(uint256 indexed accountId, IAccountRegistry.AccountState from, IAccountRegistry.AccountState to);

    function setUp() external {
        registry = new AccountRegistry(admin);
        bytes32 vaultRole = registry.VAULT_ROLE();

        vm.prank(admin);
        registry.grantRole(vaultRole, vault);
    }

    function testRegisterSetsOwnerAndExaminationState() external {
        vm.expectEmit(true, true, false, true, address(registry));
        emit AccountRegistered(1, owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit StateChanged(1, IAccountRegistry.AccountState.NONE, IAccountRegistry.AccountState.EXAMINATION);

        vm.prank(vault);
        uint256 accountId = registry.register(owner);

        assertEq(accountId, 1);
        assertEq(registry.nextAccountId(), 2);
        assertEq(registry.ownerOf(accountId), owner);
        assertEq(uint256(registry.stateOf(accountId)), uint256(IAccountRegistry.AccountState.EXAMINATION));
    }

    function testRegisterRejectsZeroOwner() external {
        vm.prank(vault);
        vm.expectRevert(AccountRegistry.ZeroAddress.selector);
        registry.register(address(0));
    }

    function testOnlyVaultCanRegister() external {
        vm.prank(stranger);
        vm.expectRevert();
        registry.register(owner);
    }

    function testOwnerAuthorizesAndRevokesSigner() external {
        uint256 accountId = _register();

        vm.expectEmit(true, true, false, true, address(registry));
        emit SignerAuthorized(accountId, signer);

        vm.prank(owner);
        registry.authorizeSigner(accountId, signer);
        assertTrue(registry.isAuthorizedSigner(accountId, signer));

        vm.expectEmit(true, true, false, true, address(registry));
        emit SignerRevoked(accountId, signer);

        vm.prank(owner);
        registry.revokeSigner(accountId, signer);
        assertFalse(registry.isAuthorizedSigner(accountId, signer));
    }

    function testNonOwnerCannotAuthorizeOrRevokeSigner() external {
        uint256 accountId = _register();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AccountRegistry.NotAccountOwner.selector, accountId, stranger));
        registry.authorizeSigner(accountId, signer);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AccountRegistry.NotAccountOwner.selector, accountId, stranger));
        registry.revokeSigner(accountId, signer);
    }

    function testOwnerIsAlwaysAuthorized() external {
        uint256 accountId = _register();

        assertTrue(registry.isAuthorizedSigner(accountId, owner));
    }

    function testOnlyVaultCanSetState() external {
        uint256 accountId = _register();

        vm.prank(stranger);
        vm.expectRevert();
        registry.setState(accountId, IAccountRegistry.AccountState.FUNDED);

        vm.expectEmit(true, false, false, true, address(registry));
        emit StateChanged(accountId, IAccountRegistry.AccountState.EXAMINATION, IAccountRegistry.AccountState.PASSED);

        vm.prank(vault);
        registry.setState(accountId, IAccountRegistry.AccountState.PASSED);
        assertEq(uint256(registry.stateOf(accountId)), uint256(IAccountRegistry.AccountState.PASSED));
    }

    function testUnknownAccountStateChangeReverts() external {
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(AccountRegistry.UnknownAccount.selector, 42));
        registry.setState(42, IAccountRegistry.AccountState.PASSED);
    }

    function testUnknownAccountViewsReturnDefaults() external {
        assertEq(registry.ownerOf(42), address(0));
        assertFalse(registry.isAuthorizedSigner(42, owner));
        assertEq(uint256(registry.stateOf(42)), uint256(IAccountRegistry.AccountState.NONE));
    }

    function _register() private returns (uint256 accountId) {
        vm.prank(vault);
        accountId = registry.register(owner);
    }
}
