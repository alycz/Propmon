// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccountView} from "../src/interfaces/IAccountView.sol";
import {IRuleEngine} from "../src/interfaces/IRuleEngine.sol";
import {RuleEngine} from "../src/rules/RuleEngine.sol";

contract MockAccountView is IAccountView {
    uint256 public balance = 10_000_000_000;
    uint256 public equity = 10_000_000_000;
    uint256 public peakEquity = 10_000_000_000;
    uint256 public dayStartEquity = 10_000_000_000;
    uint256 public openPositions;
    uint256 public committedCollateral;

    function setSnapshot(
        uint256 balance_,
        uint256 equity_,
        uint256 peakEquity_,
        uint256 dayStartEquity_,
        uint256 openPositions_,
        uint256 committedCollateral_
    ) external {
        balance = balance_;
        equity = equity_;
        peakEquity = peakEquity_;
        dayStartEquity = dayStartEquity_;
        openPositions = openPositions_;
        committedCollateral = committedCollateral_;
    }

    function accountSnapshot(uint256)
        external
        view
        returns (
            uint256 balance_,
            uint256 equity_,
            uint256 peakEquity_,
            uint256 dayStartEquity_,
            uint256 openPositions_,
            uint256 committedCollateral_
        )
    {
        return (balance, equity, peakEquity, dayStartEquity, openPositions, committedCollateral);
    }
}

contract RuleEngineTest is Test {
    uint256 private constant ACCOUNT_ID = 1;
    uint256 private constant TIER_ID = 2;
    uint256 private constant PRICE = 10_000;
    uint8 private constant PRICE_DECIMALS = 2;
    uint8 private constant SIZE_DECIMALS = 0;

    RuleEngine private engine;
    MockAccountView private accountView;

    function setUp() external {
        engine = new RuleEngine(address(this));
        accountView = new MockAccountView();
        engine.setRuleSet(TIER_ID, _ruleSet(1_000, 500, 1_000, 10, 20_000_000_000, 2));
        engine.configureAccount(ACCOUNT_ID, TIER_ID, address(accountView));
    }

    function testOverLeverageReturnsReason() external {
        engine.setRuleSet(TIER_ID, _ruleSet(1_000, 500, 1_000, 2, 1_000_000_000_000, 2));

        (bool ok, string memory reason) = engine.checkTradeDetailed(_input(300, 1_000_000_000, true));

        assertFalse(ok);
        assertEq(reason, "MAX_LEVERAGE");
    }

    function testOverNotionalReturnsReason() external {
        engine.setRuleSet(TIER_ID, _ruleSet(1_000, 500, 1_000, 100, 500_000_000, 2));

        (bool ok, string memory reason) = engine.checkTradeDetailed(_input(10, 1_000_000_000, true));

        assertFalse(ok);
        assertEq(reason, "MAX_NOTIONAL");
    }

    function testExceedMaxOpenPositionsReturnsReason() external {
        accountView.setSnapshot(10_000_000_000, 10_000_000_000, 10_000_000_000, 10_000_000_000, 2, 0);

        (bool ok, string memory reason) = engine.checkTradeDetailed(_input(10, 1_000_000_000, true));

        assertFalse(ok);
        assertEq(reason, "MAX_CONCENTRATION");
    }

    function testCapitalDeployedAboveEquityReturnsReason() external {
        accountView.setSnapshot(10_000_000_000, 10_000_000_000, 10_000_000_000, 10_000_000_000, 0, 9_500_000_000);

        (bool ok, string memory reason) = engine.checkTradeDetailed(_input(10, 600_000_001, true));

        assertFalse(ok);
        assertEq(reason, "CAPITAL_DEPLOYED");
    }

    function testInBoundsTradeReturnsOk() external {
        (bool ok, string memory reason) = engine.checkTradeDetailed(_input(10, 1_000_000_000, true));

        assertTrue(ok);
        assertEq(reason, "");
    }

    function testEquityAtTargetPasses() external {
        accountView.setSnapshot(10_000_000_000, 11_000_000_000, 11_000_000_000, 10_000_000_000, 0, 0);

        (bool passed, bool failed) = engine.evaluatePassFail(ACCOUNT_ID);

        assertTrue(passed);
        assertFalse(failed);
    }

    function testDailyDrawdownOverLimitFails() external {
        accountView.setSnapshot(10_000_000_000, 9_490_000_000, 10_000_000_000, 10_000_000_000, 0, 0);

        (bool passed, bool failed) = engine.evaluatePassFail(ACCOUNT_ID);

        assertFalse(passed);
        assertTrue(failed);
    }

    function testTotalDrawdownOverLimitFails() external {
        accountView.setSnapshot(10_000_000_000, 10_700_000_000, 12_000_000_000, 10_700_000_000, 0, 0);

        (bool passed, bool failed) = engine.evaluatePassFail(ACCOUNT_ID);

        assertFalse(passed);
        assertTrue(failed);
    }

    function testBreachAndAboveTargetFailsWins() external {
        accountView.setSnapshot(10_000_000_000, 11_000_000_000, 12_000_000_000, 12_000_000_000, 0, 0);

        (bool passed, bool failed) = engine.evaluatePassFail(ACCOUNT_ID);

        assertFalse(passed);
        assertTrue(failed);
    }

    function _input(int256 sizeDelta, uint256 collateral, bool opensNewPosition)
        private
        pure
        returns (IRuleEngine.TradeCheckInput memory)
    {
        return IRuleEngine.TradeCheckInput({
            accountId: ACCOUNT_ID,
            marketId: 1,
            sizeDelta: sizeDelta,
            collateral: collateral,
            markPrice: PRICE,
            priceDecimals: PRICE_DECIMALS,
            sizeDecimals: SIZE_DECIMALS,
            opensNewPosition: opensNewPosition
        });
    }

    function _ruleSet(
        uint256 profitTargetBps,
        uint256 maxDailyDrawdownBps,
        uint256 maxTotalDrawdownBps,
        uint256 maxLeverageX,
        uint256 maxNotional,
        uint256 maxOpenPositions
    ) private pure returns (IRuleEngine.RuleSet memory) {
        return IRuleEngine.RuleSet({
            profitTargetBps: profitTargetBps,
            maxDailyDrawdownBps: maxDailyDrawdownBps,
            maxTotalDrawdownBps: maxTotalDrawdownBps,
            maxLeverageX: maxLeverageX,
            maxNotional: maxNotional,
            maxOpenPositions: maxOpenPositions
        });
    }
}
