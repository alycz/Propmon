// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccountRegistry} from "../src/interfaces/IAccountRegistry.sol";
import {IAccountView} from "../src/interfaces/IAccountView.sol";
import {IFundedVault} from "../src/interfaces/IFundedVault.sol";
import {IPerplPriceAdapter} from "../src/interfaces/IPerplPriceAdapter.sol";
import {IRuleEngine} from "../src/interfaces/IRuleEngine.sol";
import {FundedVault} from "../src/vaults/FundedVault.sol";

contract FundedMockRegistry is IAccountRegistry {
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

    function setOwner(uint256 accountId, address owner) external {
        owners[accountId] = owner;
    }

    function setAuthorizedSigner(uint256 accountId, address signer, bool authorized) external {
        authorizedSigners[accountId][signer] = authorized;
    }
}

contract FundedMockExaminationVault is IAccountView {
    mapping(uint256 accountId => uint256 balance) public balances;
    mapping(uint256 accountId => uint256 equity) public equities;
    mapping(uint256 accountId => uint256 peakEquity) public peaks;
    mapping(uint256 accountId => uint256 dayStartEquity) public dayStarts;

    function setSnapshot(uint256 accountId, uint256 balance) external {
        balances[accountId] = balance;
        equities[accountId] = balance;
        peaks[accountId] = balance;
        dayStarts[accountId] = balance;
    }

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
        )
    {
        return (balances[accountId], equities[accountId], peaks[accountId], dayStarts[accountId], 0, 0);
    }
}

contract FundedMockPriceAdapter is IPerplPriceAdapter {
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

contract FundedMockRuleEngine is IRuleEngine {
    bool public checkOk = true;
    string public checkReason = "";

    function setCheck(bool ok, string memory reason) external {
        checkOk = ok;
        checkReason = reason;
    }

    function checkTrade(uint256, int256, uint256, uint256) external view returns (bool ok, string memory reason) {
        return (checkOk, checkReason);
    }

    function evaluatePassFail(uint256) external pure returns (bool passed, bool failed) {
        return (false, false);
    }
}

contract FundedMockToken is IERC20 {
    string public name = "Mock AUSD";
    string public symbol = "AUSD";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        require(approved >= amount, "ALLOWANCE");
        allowance[from][msg.sender] = approved - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract FundedVaultTest is Test {
    uint256 private constant ACCOUNT_ID = 1;
    uint256 private constant ACCOUNT_SIZE = 10_000_000_000;
    uint256 private constant MARKET_ID = 1;
    uint256 private constant MAX_PRICE_AGE = 1 hours;
    uint256 private constant TRADER_SHARE_BPS = 8_000;

    address private admin = address(0xA11CE);
    address private reconciler = address(0xBEEF);
    address private trader = address(0xCAFE);
    address private signer = address(0xD00D);
    address private stranger = address(0xE0A);
    address private treasury = address(0xF00D);
    address private recipient = address(0xFEED);

    FundedMockRegistry private registry;
    FundedMockExaminationVault private examinationVault;
    FundedMockPriceAdapter private priceAdapter;
    FundedMockRuleEngine private ruleEngine;
    FundedMockToken private token;
    FundedVault private vault;

    event FundedAccountActivated(uint256 indexed accountId, address indexed owner);
    event LivePositionIntent(
        uint256 indexed accountId,
        uint256 indexed requestId,
        uint256 indexed marketId,
        IFundedVault.Side side,
        int256 sizeDelta,
        uint256 collateral
    );
    event PositionFilled(
        uint256 indexed accountId,
        uint256 indexed requestId,
        uint256 indexed marketId,
        IFundedVault.FillMode mode,
        int256 sizeDelta,
        uint256 fillPrice
    );
    event PayoutClaimed(
        uint256 indexed accountId, address indexed recipient, uint256 traderAmount, uint256 protocolAmount
    );

    function setUp() external {
        vm.warp(1 days);

        registry = new FundedMockRegistry();
        examinationVault = new FundedMockExaminationVault();
        priceAdapter = new FundedMockPriceAdapter();
        ruleEngine = new FundedMockRuleEngine();
        token = new FundedMockToken();
        vault = new FundedVault(
            registry,
            examinationVault,
            priceAdapter,
            ruleEngine,
            token,
            treasury,
            MAX_PRICE_AGE,
            TRADER_SHARE_BPS,
            admin,
            reconciler
        );

        vm.prank(admin);
        vault.setMarketSizeDecimals(MARKET_ID, 0);

        registry.setOwner(ACCOUNT_ID, trader);
        registry.setState(ACCOUNT_ID, IAccountRegistry.AccountState.PASSED);
        examinationVault.setSnapshot(ACCOUNT_ID, ACCOUNT_SIZE);
        priceAdapter.setPrice(MARKET_ID, 10_000, 2);
    }

    function testActivateOnlyFromPassedAndReservesCollateral() external {
        token.mint(address(vault), ACCOUNT_SIZE);

        vm.expectEmit(true, true, false, true, address(vault));
        emit FundedAccountActivated(ACCOUNT_ID, trader);

        vault.activate(ACCOUNT_ID);

        assertEq(uint256(registry.states(ACCOUNT_ID)), uint256(IAccountRegistry.AccountState.FUNDED));
        assertEq(vault.totalReservedCollateral(), ACCOUNT_SIZE);

        FundedVault.AccountViewData memory account = vault.getAccount(ACCOUNT_ID);
        assertEq(account.owner, trader);
        assertEq(account.startingBalance, ACCOUNT_SIZE);
        assertEq(account.equity, ACCOUNT_SIZE);
        assertEq(account.reservedCollateral, ACCOUNT_SIZE);
    }

    function testActivateRevertsOutsidePassedState() external {
        registry.setState(ACCOUNT_ID, IAccountRegistry.AccountState.EXAMINATION);
        token.mint(address(vault), ACCOUNT_SIZE);

        vm.expectRevert(
            abi.encodeWithSelector(
                FundedVault.InvalidAccountState.selector, ACCOUNT_ID, IAccountRegistry.AccountState.EXAMINATION
            )
        );
        vault.activate(ACCOUNT_ID);
    }

    function testActivateRejectsInsufficientVaultLiquidity() external {
        token.mint(address(vault), ACCOUNT_SIZE - 1);

        vm.expectRevert(
            abi.encodeWithSelector(FundedVault.InsufficientVaultLiquidity.selector, ACCOUNT_SIZE, ACCOUNT_SIZE - 1)
        );
        vault.activate(ACCOUNT_ID);
    }

    function testOnlyAuthorizedSignersCanOpenLiveAndDemo() external {
        _activate();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FundedVault.UnauthorizedSigner.selector, ACCOUNT_ID, stranger));
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FundedVault.UnauthorizedSigner.selector, ACCOUNT_ID, stranger));
        vault.openPositionLive(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        registry.setAuthorizedSigner(ACCOUNT_ID, signer, true);

        vm.prank(signer);
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(signer);
        uint256 requestId = vault.openPositionLive(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 5, 500_000_000);
        assertEq(requestId, 1);
    }

    function testPreTradeRuleBreachRevertsWithReason() external {
        _activate();
        ruleEngine.setCheck(false, "MAX_NOTIONAL");

        vm.prank(trader);
        vm.expectRevert(bytes("MAX_NOTIONAL"));
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);
    }

    function testOpenAndCloseDemoSettlesAgainstAdapterPrice() external {
        _activate();

        vm.prank(trader);
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        FundedVault.PositionData memory position = vault.positionOf(ACCOUNT_ID, MARKET_ID);
        assertEq(position.size, 10);
        assertEq(position.collateral, 1_000_000_000);

        priceAdapter.setPrice(MARKET_ID, 11_000, 2);

        vm.expectEmit(true, true, true, true, address(vault));
        emit PositionFilled(ACCOUNT_ID, 0, MARKET_ID, IFundedVault.FillMode.DEMO, -10, 11_000);

        vm.prank(trader);
        vault.closePositionDemo(ACCOUNT_ID, MARKET_ID, -10);

        FundedVault.AccountViewData memory account = vault.getAccount(ACCOUNT_ID);
        assertEq(account.realizedPnl, 100_000_000);
        assertEq(account.equity, ACCOUNT_SIZE + 100_000_000);
        assertEq(account.openPositions, 0);
        assertEq(account.committedCollateral, 0);
    }

    function testCloseDemoRejectsOpenOrFlipAttempt() external {
        _activate();

        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(
                FundedVault.InvalidClosePosition.selector, ACCOUNT_ID, MARKET_ID, int256(0), int256(-10)
            )
        );
        vault.closePositionDemo(ACCOUNT_ID, MARKET_ID, -10);

        vm.prank(trader);
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(
                FundedVault.InvalidClosePosition.selector, ACCOUNT_ID, MARKET_ID, int256(10), int256(1)
            )
        );
        vault.closePositionDemo(ACCOUNT_ID, MARKET_ID, 1);

        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(
                FundedVault.InvalidClosePosition.selector, ACCOUNT_ID, MARKET_ID, int256(10), int256(-11)
            )
        );
        vault.closePositionDemo(ACCOUNT_ID, MARKET_ID, -11);
    }

    function testOpenLiveRecordsPendingIntent() external {
        _activate();

        vm.expectEmit(true, true, true, true, address(vault));
        emit LivePositionIntent(ACCOUNT_ID, 1, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(trader);
        uint256 requestId = vault.openPositionLive(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        FundedVault.OrderData memory order = vault.getOrder(ACCOUNT_ID, requestId);
        assertEq(uint256(order.status), uint256(FundedVault.OrderStatus.PENDING));
        assertEq(order.marketId, MARKET_ID);
        assertEq(order.sizeDelta, 10);
        assertEq(order.markPrice, 10_000);

        FundedVault.AccountViewData memory account = vault.getAccount(ACCOUNT_ID);
        assertEq(account.pendingOrders, 1);
    }

    function testOnlyReconcilerCanReconcileAndFillUpdatesAccounting() external {
        _activate();

        vm.prank(trader);
        uint256 requestId = vault.openPositionLive(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(stranger);
        vm.expectRevert();
        vault.reconcileFill(ACCOUNT_ID, requestId, MARKET_ID, 10, 10_000);

        vm.expectEmit(true, true, true, true, address(vault));
        emit PositionFilled(ACCOUNT_ID, requestId, MARKET_ID, IFundedVault.FillMode.LIVE, 10, 10_000);

        vm.prank(reconciler);
        vault.reconcileFill(ACCOUNT_ID, requestId, MARKET_ID, 10, 10_000);

        FundedVault.OrderData memory order = vault.getOrder(ACCOUNT_ID, requestId);
        assertEq(uint256(order.status), uint256(FundedVault.OrderStatus.FILLED));

        FundedVault.PositionData memory position = vault.positionOf(ACCOUNT_ID, MARKET_ID);
        assertEq(position.size, 10);

        FundedVault.AccountViewData memory account = vault.getAccount(ACCOUNT_ID);
        assertEq(account.pendingOrders, 0);
        assertEq(account.openPositions, 1);
    }

    function testReconcilerCanCancelPendingOrder() external {
        _activate();

        vm.prank(trader);
        uint256 requestId = vault.openPositionLive(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(reconciler);
        vault.cancelOrder(ACCOUNT_ID, requestId);

        FundedVault.OrderData memory order = vault.getOrder(ACCOUNT_ID, requestId);
        assertEq(uint256(order.status), uint256(FundedVault.OrderStatus.CANCELLED));

        FundedVault.AccountViewData memory account = vault.getAccount(ACCOUNT_ID);
        assertEq(account.pendingOrders, 0);
    }

    function testPayoutRequiresProfitAndClosedPositionsThenPaysSplit() external {
        _activate();

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(FundedVault.NoProfit.selector, ACCOUNT_ID));
        vault.payout(ACCOUNT_ID, recipient);

        vm.prank(trader);
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(FundedVault.OpenPositions.selector, ACCOUNT_ID));
        vault.payout(ACCOUNT_ID, recipient);

        priceAdapter.setPrice(MARKET_ID, 11_000, 2);

        vm.prank(trader);
        vault.closePositionDemo(ACCOUNT_ID, MARKET_ID, -10);

        uint256 profit = 100_000_000;
        token.mint(address(vault), profit);

        vm.expectEmit(true, true, false, true, address(vault));
        emit PayoutClaimed(ACCOUNT_ID, recipient, 80_000_000, 20_000_000);

        vm.prank(trader);
        (uint256 traderAmount, uint256 protocolAmount) = vault.payout(ACCOUNT_ID, recipient);

        assertEq(traderAmount, 80_000_000);
        assertEq(protocolAmount, 20_000_000);
        assertEq(token.balanceOf(recipient), 80_000_000);
        assertEq(token.balanceOf(treasury), 20_000_000);
        assertEq(token.balanceOf(address(vault)), ACCOUNT_SIZE);
        assertEq(uint256(registry.states(ACCOUNT_ID)), uint256(IAccountRegistry.AccountState.PAYOUT));

        token.mint(address(vault), profit);
        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(
                FundedVault.InvalidAccountState.selector, ACCOUNT_ID, IAccountRegistry.AccountState.PAYOUT
            )
        );
        vault.payout(ACCOUNT_ID, recipient);
    }

    function testSnapshotAndDrawdownReflectCurrentPrice() external {
        _activate();

        vm.prank(trader);
        vault.openPositionDemo(ACCOUNT_ID, MARKET_ID, IFundedVault.Side.LONG, 10, 1_000_000_000);

        priceAdapter.setPrice(MARKET_ID, 9_000, 2);

        (
            uint256 balance,
            uint256 equity,
            uint256 peakEquity,
            uint256 dayStartEquity,
            uint256 openPositions,
            uint256 committedCollateral
        ) = vault.accountSnapshot(ACCOUNT_ID);

        assertEq(balance, ACCOUNT_SIZE);
        assertEq(equity, ACCOUNT_SIZE - 100_000_000);
        assertEq(peakEquity, ACCOUNT_SIZE);
        assertEq(dayStartEquity, ACCOUNT_SIZE);
        assertEq(openPositions, 1);
        assertEq(committedCollateral, 1_000_000_000);

        (uint256 dailyBps, uint256 totalBps) = vault.getDrawdown(ACCOUNT_ID);
        assertEq(dailyBps, 100);
        assertEq(totalBps, 100);
    }

    function _activate() private {
        token.mint(address(vault), ACCOUNT_SIZE);
        vault.activate(ACCOUNT_ID);
    }
}
