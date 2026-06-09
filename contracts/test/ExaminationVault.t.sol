// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccountRegistry} from "../src/interfaces/IAccountRegistry.sol";
import {IExaminationVault} from "../src/interfaces/IExaminationVault.sol";
import {IPerplPriceAdapter} from "../src/interfaces/IPerplPriceAdapter.sol";
import {IRuleEngine} from "../src/interfaces/IRuleEngine.sol";
import {ExaminationVault} from "../src/vaults/ExaminationVault.sol";

contract MockAccountRegistry is IAccountRegistry {
    mapping(uint256 accountId => address owner) public owners;
    mapping(uint256 accountId => AccountState state) public states;
    mapping(uint256 accountId => mapping(address signer => bool authorized)) public authorizedSigners;

    function ownerOf(uint256 accountId) external view returns (address) {
        return owners[accountId];
    }

    function isAuthorizedSigner(uint256 accountId, address signer) external view returns (bool) {
        return authorizedSigners[accountId][signer];
    }

    function stateOf(uint256 accountId) external view returns (AccountState) {
        return states[accountId];
    }

    function setState(uint256 accountId, AccountState state) external {
        states[accountId] = state;
    }

    function setAuthorizedSigner(uint256 accountId, address signer, bool authorized) external {
        authorizedSigners[accountId][signer] = authorized;
    }
}

contract MockPriceAdapter is IPerplPriceAdapter {
    struct PriceData {
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
        bool forceStale;
    }

    mapping(uint256 marketId => PriceData priceData) public prices;

    function setPrice(uint256 marketId, uint256 price, uint8 decimals) external {
        prices[marketId] = PriceData({price: price, decimals: decimals, updatedAt: block.timestamp, forceStale: false});
    }

    function setStale(uint256 marketId, bool stale) external {
        prices[marketId].forceStale = stale;
    }

    function getPrice(uint256 marketId) external view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        PriceData memory priceData = prices[marketId];
        return (priceData.price, priceData.decimals, priceData.updatedAt);
    }

    function isStale(uint256 marketId, uint256 maxAge) external view returns (bool) {
        PriceData memory priceData = prices[marketId];
        if (priceData.forceStale || priceData.updatedAt == 0) return true;
        return block.timestamp > priceData.updatedAt + maxAge;
    }
}

contract MockRuleEngine is IRuleEngine {
    bool public checkOk = true;
    string public checkReason = "";
    bool public passed;
    bool public failed;
    uint256 public configuredAccountId;
    uint256 public configuredTierId;
    address public configuredAccountView;
    bool public enforceExpectedInput;
    uint256 public expectedAccountId;
    uint256 public expectedMarketId;
    int256 public expectedSizeDelta;
    uint256 public expectedCollateral;
    uint256 public expectedMarkPrice;
    uint8 public expectedPriceDecimals;
    uint8 public expectedSizeDecimals;
    bool public expectedOpensNewPosition;

    function setCheck(bool ok, string memory reason) external {
        checkOk = ok;
        checkReason = reason;
    }

    function setResolution(bool passed_, bool failed_) external {
        passed = passed_;
        failed = failed_;
    }

    function setExpectedDetailedInput(
        uint256 accountId,
        uint256 marketId,
        int256 sizeDelta,
        uint256 collateral,
        uint256 markPrice,
        uint8 priceDecimals,
        uint8 sizeDecimals,
        bool opensNewPosition
    ) external {
        enforceExpectedInput = true;
        expectedAccountId = accountId;
        expectedMarketId = marketId;
        expectedSizeDelta = sizeDelta;
        expectedCollateral = collateral;
        expectedMarkPrice = markPrice;
        expectedPriceDecimals = priceDecimals;
        expectedSizeDecimals = sizeDecimals;
        expectedOpensNewPosition = opensNewPosition;
    }

    function configureAccount(uint256 accountId, uint256 tierId, address accountView) external {
        configuredAccountId = accountId;
        configuredTierId = tierId;
        configuredAccountView = accountView;
    }

    function setRuleSet(uint256, RuleSet calldata) external {}

    function getRuleSetForTier(uint256) external pure returns (RuleSet memory) {
        return RuleSet({
            profitTargetBps: 0,
            maxDailyDrawdownBps: 0,
            maxTotalDrawdownBps: 0,
            maxLeverageX: 0,
            maxNotional: 0,
            maxOpenPositions: 0
        });
    }

    function getRuleSetForAccount(uint256) external pure returns (RuleSet memory) {
        return RuleSet({
            profitTargetBps: 0,
            maxDailyDrawdownBps: 0,
            maxTotalDrawdownBps: 0,
            maxLeverageX: 0,
            maxNotional: 0,
            maxOpenPositions: 0
        });
    }

    function checkTradeDetailed(TradeCheckInput calldata input) external view returns (bool ok, string memory reason) {
        if (
            enforceExpectedInput
                && (input.accountId != expectedAccountId
                    || input.marketId != expectedMarketId
                    || input.sizeDelta != expectedSizeDelta
                    || input.collateral != expectedCollateral
                    || input.markPrice != expectedMarkPrice
                    || input.priceDecimals != expectedPriceDecimals
                    || input.sizeDecimals != expectedSizeDecimals
                    || input.opensNewPosition != expectedOpensNewPosition)
        ) {
            return (false, "BAD_DETAILED_INPUT");
        }
        return (checkOk, checkReason);
    }

    function checkTrade(uint256, int256, uint256, uint256) external view returns (bool ok, string memory reason) {
        return (checkOk, checkReason);
    }

    function evaluatePassFail(uint256) external view returns (bool passed_, bool failed_) {
        return (passed, failed);
    }
}

contract ExaminationVaultTest is Test {
    uint256 private constant ACCOUNT_SIZE = 10_000_000_000;
    uint256 private constant FEE = 100_000_000;
    uint256 private constant MARKET_ID = 1;
    uint256 private constant MON_MARKET_ID = 64;
    uint256 private constant MAX_PRICE_AGE = 1 hours;
    uint256 private constant DEFAULT_TIER_ID = 1;

    address private admin = address(0xA11CE);
    address private trader = address(0xB0B);
    address private signer = address(0xCAFE);
    address private stranger = address(0xE0A);

    MockAccountRegistry private registry;
    MockPriceAdapter private priceAdapter;
    MockRuleEngine private ruleEngine;
    ExaminationVault private vault;

    event ExaminationPurchased(uint256 indexed accountId, address indexed owner, uint256 accountSize, uint256 feePaid);
    event EntryRecorded(
        uint256 indexed accountId, uint256 indexed marketId, int256 sizeDelta, uint256 markPrice, uint256 newEquity
    );
    event ExaminationPassed(uint256 indexed accountId);
    event ExaminationFailed(uint256 indexed accountId, string reason);

    function setUp() external {
        vm.warp(1 days);

        registry = new MockAccountRegistry();
        priceAdapter = new MockPriceAdapter();
        ruleEngine = new MockRuleEngine();
        vault = new ExaminationVault(registry, priceAdapter, ruleEngine, MAX_PRICE_AGE, DEFAULT_TIER_ID, admin);

        vm.prank(admin);
        vault.setMarketSizeDecimals(MARKET_ID, 0);

        vm.prank(admin);
        vault.setMarketSizeDecimals(MON_MARKET_ID, 0);

        priceAdapter.setPrice(MARKET_ID, 10_000, 2);
        priceAdapter.setPrice(MON_MARKET_ID, 2_080, 5);
    }

    function testBuyChargesFeeAndSetsExaminationState() external {
        vm.deal(trader, FEE);

        vm.expectEmit(true, true, false, true, address(vault));
        emit ExaminationPurchased(1, trader, ACCOUNT_SIZE, FEE);

        vm.prank(trader);
        uint256 accountId = vault.buyExamination{value: FEE}(ACCOUNT_SIZE);

        assertEq(accountId, 1);
        assertEq(address(vault).balance, FEE);
        assertEq(uint256(registry.states(accountId)), uint256(IAccountRegistry.AccountState.EXAMINATION));
        assertEq(ruleEngine.configuredAccountId(), accountId);
        assertEq(ruleEngine.configuredTierId(), DEFAULT_TIER_ID);
        assertEq(ruleEngine.configuredAccountView(), address(vault));

        ExaminationVault.AccountViewData memory account = vault.getAccount(accountId);
        assertEq(account.owner, trader);
        assertEq(account.startingBalance, ACCOUNT_SIZE);
        assertEq(account.equity, ACCOUNT_SIZE);
        assertEq(account.peakEquity, ACCOUNT_SIZE);
        assertEq(account.dayStartEquity, ACCOUNT_SIZE);
    }

    function testBuyRevertsOnIncorrectFee() external {
        vm.deal(trader, FEE);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(ExaminationVault.IncorrectFee.selector, FEE, FEE - 1));
        vault.buyExamination{value: FEE - 1}(ACCOUNT_SIZE);
    }

    function testStrangerCannotRecordEntry() external {
        uint256 accountId = _buy();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ExaminationVault.UnauthorizedSigner.selector, accountId, stranger));
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);
    }

    function testOwnerAndAuthorizedSignerCanRecordEntry() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);

        registry.setAuthorizedSigner(accountId, signer, true);

        vm.prank(signer);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 5, 500_000_000);

        ExaminationVault.Entry[] memory ledger = vault.getEntries(accountId);
        assertEq(ledger.length, 2);
        assertEq(ledger[1].sizeDelta, 5);
    }

    function testStalePriceReverts() external {
        uint256 accountId = _buy();
        priceAdapter.setStale(MARKET_ID, true);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(ExaminationVault.StalePrice.selector, MARKET_ID));
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);
    }

    function testPreTradeRuleBreachRevertsWithReason() external {
        uint256 accountId = _buy();
        ruleEngine.setCheck(false, "MAX_NOTIONAL");

        vm.prank(trader);
        vm.expectRevert(bytes("MAX_NOTIONAL"));
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);
    }

    function testRecordEntryUsesDetailedRuleCheck() external {
        uint256 accountId = _buy();
        ruleEngine.setExpectedDetailedInput(accountId, MARKET_ID, 10, 1_000_000_000, 10_000, 2, 0, true);

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);
    }

    function testProfitableRoundTripComputesRealizedPnlAndEquity() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);

        priceAdapter.setPrice(MARKET_ID, 11_000, 2);

        vm.expectEmit(true, true, false, true, address(vault));
        emit EntryRecorded(accountId, MARKET_ID, -10, 11_000, ACCOUNT_SIZE + 100_000_000);

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.SHORT, -10, 0);

        ExaminationVault.AccountViewData memory account = vault.getAccount(accountId);
        assertEq(account.realizedPnl, 100_000_000);
        assertEq(account.equity, ACCOUNT_SIZE + 100_000_000);
        assertEq(account.openPositions, 0);
        assertEq(account.committedCollateral, 0);
    }

    function testLosingTradeUpdatesDrawdownAndResolvesFailed() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 100, 1_000_000_000);

        priceAdapter.setPrice(MARKET_ID, 5_000, 2);
        ruleEngine.setResolution(false, true);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ExaminationFailed(accountId, "RULE_ENGINE_FAILED");

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.SHORT, -100, 0);

        assertEq(uint256(registry.states(accountId)), uint256(IAccountRegistry.AccountState.FAILED));

        (uint256 dailyBps, uint256 totalBps) = vault.getDrawdown(accountId);
        assertEq(dailyBps, 5_000);
        assertEq(totalBps, 5_000);
    }

    function testCleanProfitTargetResolvesPassed() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 200, 2_000_000_000);

        priceAdapter.setPrice(MARKET_ID, 20_000, 2);
        ruleEngine.setResolution(true, false);

        vm.expectEmit(true, false, false, true, address(vault));
        emit ExaminationPassed(accountId);

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.SHORT, -200, 0);

        assertEq(uint256(registry.states(accountId)), uint256(IAccountRegistry.AccountState.PASSED));

        ExaminationVault.AccountViewData memory account = vault.getAccount(accountId);
        assertEq(account.realizedPnl, 20_000_000_000);
        assertEq(account.equity, 30_000_000_000);
    }

    function testScriptedMonDemoSequenceReachesPassDeterministically() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MON_MARKET_ID, IExaminationVault.Side.LONG, 250_000, 250_000_000);

        priceAdapter.setPrice(MON_MARKET_ID, 2_100, 5);

        vm.prank(trader);
        vault.recordEntry(accountId, MON_MARKET_ID, IExaminationVault.Side.LONG, 125_000, 125_000_000);

        priceAdapter.setPrice(MON_MARKET_ID, 2_480, 5);
        ruleEngine.setResolution(true, false);

        vm.prank(trader);
        vault.recordEntry(accountId, MON_MARKET_ID, IExaminationVault.Side.SHORT, -375_000, 0);

        assertEq(uint256(registry.states(accountId)), uint256(IAccountRegistry.AccountState.PASSED));

        ExaminationVault.AccountViewData memory account = vault.getAccount(accountId);
        assertTrue(account.realizedPnl > int256(1_000_000_000));
        assertEq(account.openPositions, 0);
    }

    function testViewsAndSnapshotStayCoherent() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);

        priceAdapter.setPrice(MARKET_ID, 11_000, 2);

        (
            uint256 balance,
            uint256 equity,
            uint256 peakEquity,
            uint256 dayStartEquity,
            uint256 openPositions,
            uint256 committedCollateral
        ) = vault.accountSnapshot(accountId);

        assertEq(balance, ACCOUNT_SIZE);
        assertEq(equity, ACCOUNT_SIZE + 100_000_000);
        assertEq(peakEquity, ACCOUNT_SIZE);
        assertEq(dayStartEquity, ACCOUNT_SIZE);
        assertEq(openPositions, 1);
        assertEq(committedCollateral, 1_000_000_000);

        ExaminationVault.Entry[] memory ledger = vault.getEntries(accountId);
        assertEq(ledger.length, 1);
        assertEq(ledger[0].marketId, MARKET_ID);

        (bool passed, bool failed) = vault.getRuleStatus(accountId);
        assertFalse(passed);
        assertFalse(failed);
    }

    function testDayStartEquityResetsOnUtcDayBoundary() external {
        uint256 accountId = _buy();

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 10, 1_000_000_000);

        vm.warp(2 days);
        priceAdapter.setPrice(MARKET_ID, 11_000, 2);

        vm.prank(trader);
        vault.recordEntry(accountId, MARKET_ID, IExaminationVault.Side.LONG, 1, 100_000_000);

        ExaminationVault.AccountViewData memory account = vault.getAccount(accountId);
        assertEq(account.dayStartEquity, ACCOUNT_SIZE + 100_000_000);
        assertEq(account.dayBucket, 2);
    }

    function _buy() private returns (uint256 accountId) {
        vm.deal(trader, FEE);
        vm.prank(trader);
        accountId = vault.buyExamination{value: FEE}(ACCOUNT_SIZE);
    }
}
