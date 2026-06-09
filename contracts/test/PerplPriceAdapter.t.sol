// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PerplPriceAdapter} from "../src/oracle/PerplPriceAdapter.sol";

contract PerplPriceAdapterTest is Test {
    PerplPriceAdapter private adapter;

    address private admin = address(0xA11CE);
    address private relayer = address(0xB0B);
    address private stranger = address(0xE0A);

    function setUp() external {
        adapter = new PerplPriceAdapter(admin, relayer);
    }

    function testOnlyRelayerCanPushPrice() external {
        vm.prank(stranger);
        vm.expectRevert();
        adapter.pushPrice(64, 2080, 5);
    }

    function testGetPriceReturnsLastPushedValue() external {
        vm.warp(1_717_171_717);

        vm.prank(relayer);
        adapter.pushPrice(64, 2080, 5);

        (uint256 price, uint8 decimals, uint256 updatedAt) = adapter.getPrice(64);
        assertEq(price, 2080);
        assertEq(decimals, 5);
        assertEq(updatedAt, 1_717_171_717);
    }

    function testIsStaleFlipsAfterMaxAge() external {
        vm.warp(100);

        assertTrue(adapter.isStale(64, 30));

        vm.prank(relayer);
        adapter.pushPrice(64, 2080, 5);

        assertFalse(adapter.isStale(64, 30));

        vm.warp(131);
        assertTrue(adapter.isStale(64, 30));
    }

    function testRejectsZeroPrice() external {
        vm.prank(relayer);
        vm.expectRevert(PerplPriceAdapter.InvalidPrice.selector);
        adapter.pushPrice(64, 0, 5);
    }

    function testRejectsDecimalsAboveEighteen() external {
        vm.prank(relayer);
        vm.expectRevert(PerplPriceAdapter.InvalidDecimals.selector);
        adapter.pushPrice(64, 2080, 19);
    }
}
