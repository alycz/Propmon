// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAccountRegistry} from "../interfaces/IAccountRegistry.sol";
import {IAccountView} from "../interfaces/IAccountView.sol";
import {IFundedVault} from "../interfaces/IFundedVault.sol";
import {IPerplPriceAdapter} from "../interfaces/IPerplPriceAdapter.sol";
import {IRuleEngine} from "../interfaces/IRuleEngine.sol";

/// @title FundedVault
/// @notice Funded-account execution ledger with live Perpl intents and transparent demo fills.
contract FundedVault is IFundedVault, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RECONCILER_ROLE = keccak256("RECONCILER_ROLE");
    uint256 public constant BPS = 10_000;
    uint8 public constant QUOTE_DECIMALS = 6;
    uint256 private constant PRICE_UNIT = 1e18;

    enum OrderStatus {
        NONE,
        PENDING,
        FILLED,
        CANCELLED
    }

    IAccountRegistry public immutable registry;
    IAccountView public immutable examinationVault;
    IPerplPriceAdapter public immutable priceAdapter;
    IRuleEngine public immutable ruleEngine;
    IERC20 public immutable settlementToken;

    address public immutable protocolTreasury;
    uint256 public immutable maxPriceAge;
    uint256 public immutable traderShareBps;
    uint256 public totalReservedCollateral;

    struct AccountData {
        address owner;
        uint256 startingBalance;
        int256 realizedPnl;
        uint256 currentEquity;
        uint256 peakEquity;
        uint256 dayStartEquity;
        uint256 dayBucket;
        uint256 committedCollateral;
        uint256 reservedCollateral;
        uint256 pendingOrders;
        bool activated;
    }

    struct AccountViewData {
        address owner;
        uint256 startingBalance;
        int256 realizedPnl;
        uint256 equity;
        uint256 peakEquity;
        uint256 dayStartEquity;
        uint256 dayBucket;
        uint256 committedCollateral;
        uint256 reservedCollateral;
        uint256 pendingOrders;
        IAccountRegistry.AccountState state;
        uint256 openPositions;
    }

    struct PositionData {
        int256 size;
        uint256 avgEntryPriceX18;
        uint256 collateral;
    }

    struct OrderData {
        uint256 requestId;
        uint256 marketId;
        Side side;
        int256 sizeDelta;
        uint256 collateral;
        uint256 markPrice;
        uint256 fillPrice;
        OrderStatus status;
        uint256 createdAt;
        uint256 filledAt;
        bool isClose;
    }

    error ZeroAddress();
    error InvalidBps(uint256 bps);
    error AlreadyActivated(uint256 accountId);
    error UnknownAccount(uint256 accountId);
    error UnauthorizedSigner(uint256 accountId, address signer);
    error InvalidAccountState(uint256 accountId, IAccountRegistry.AccountState state);
    error InsufficientVaultLiquidity(uint256 required, uint256 available);
    error StalePrice(uint256 marketId);
    error InvalidPrice(uint256 marketId);
    error InvalidMarketDecimals(uint8 decimals);
    error InvalidSizeDelta();
    error InvalidClosePosition(uint256 accountId, uint256 marketId, int256 currentSize, int256 sizeDelta);
    error InvalidOrder(uint256 accountId, uint256 requestId);
    error InvalidOrderStatus(uint256 accountId, uint256 requestId, OrderStatus status);
    error NoProfit(uint256 accountId);
    error OpenPositions(uint256 accountId);
    error PendingOrders(uint256 accountId);

    event AccountCollateralReserved(uint256 indexed accountId, uint256 amount);
    event DemoFill(uint256 indexed accountId, uint256 indexed marketId, uint256 price, int256 sizeDelta);
    event OrderCancelled(uint256 indexed accountId, uint256 indexed requestId);
    event MarketSizeDecimalsSet(uint256 indexed marketId, uint8 sizeDecimals);

    mapping(uint256 accountId => AccountData account) private accounts;
    mapping(uint256 accountId => mapping(uint256 marketId => PositionData position)) private positions;
    mapping(uint256 accountId => uint256[] marketIds) private activeMarkets;
    mapping(uint256 accountId => mapping(uint256 marketId => uint256 indexPlusOne)) private activeMarketIndexPlusOne;
    mapping(uint256 accountId => mapping(uint256 requestId => OrderData order)) private orders;
    mapping(uint256 accountId => uint256 nextRequestId) public nextRequestId;
    mapping(uint256 marketId => uint8 sizeDecimals) public marketSizeDecimals;

    constructor(
        IAccountRegistry registry_,
        IAccountView examinationVault_,
        IPerplPriceAdapter priceAdapter_,
        IRuleEngine ruleEngine_,
        IERC20 settlementToken_,
        address protocolTreasury_,
        uint256 maxPriceAge_,
        uint256 traderShareBps_,
        address admin_,
        address reconciler_
    ) {
        if (
            address(registry_) == address(0) || address(examinationVault_) == address(0)
                || address(priceAdapter_) == address(0) || address(ruleEngine_) == address(0)
                || address(settlementToken_) == address(0) || protocolTreasury_ == address(0) || admin_ == address(0)
                || reconciler_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (traderShareBps_ > BPS) revert InvalidBps(traderShareBps_);

        registry = registry_;
        examinationVault = examinationVault_;
        priceAdapter = priceAdapter_;
        ruleEngine = ruleEngine_;
        settlementToken = settlementToken_;
        protocolTreasury = protocolTreasury_;
        maxPriceAge = maxPriceAge_;
        traderShareBps = traderShareBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(RECONCILER_ROLE, reconciler_);
    }

    function activate(uint256 accountId) external nonReentrant {
        if (accounts[accountId].activated) revert AlreadyActivated(accountId);

        IAccountRegistry.AccountState state = registry.stateOf(accountId);
        if (state != IAccountRegistry.AccountState.PASSED) revert InvalidAccountState(accountId, state);

        address owner = registry.ownerOf(accountId);
        if (owner == address(0)) revert UnknownAccount(accountId);

        (uint256 balance,,,,,) = examinationVault.accountSnapshot(accountId);
        if (balance == 0) revert UnknownAccount(accountId);

        uint256 required = totalReservedCollateral + balance;
        uint256 available = settlementToken.balanceOf(address(this));
        if (available < required) revert InsufficientVaultLiquidity(required, available);

        uint256 dayBucket = block.timestamp / 1 days;
        accounts[accountId] = AccountData({
            owner: owner,
            startingBalance: balance,
            realizedPnl: 0,
            currentEquity: balance,
            peakEquity: balance,
            dayStartEquity: balance,
            dayBucket: dayBucket,
            committedCollateral: 0,
            reservedCollateral: balance,
            pendingOrders: 0,
            activated: true
        });
        totalReservedCollateral = required;
        nextRequestId[accountId] = 1;

        registry.setState(accountId, IAccountRegistry.AccountState.FUNDED);
        emit FundedAccountActivated(accountId, owner);
        emit AccountCollateralReserved(accountId, balance);
    }

    function openPositionLive(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        _requireValidSide(side, sizeDelta);
        uint256 markPrice = _checkTrade(accountId, marketId, sizeDelta, collateral);
        requestId = _recordLiveIntent(accountId, marketId, side, sizeDelta, collateral, markPrice, false);
    }

    function closePositionLive(uint256 accountId, uint256 marketId, int256 sizeDelta)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        _requireCloseSize(sizeDelta);
        Side side = sizeDelta > 0 ? Side.LONG : Side.SHORT;
        uint256 markPrice = _checkTrade(accountId, marketId, sizeDelta, 0);
        _requireClosingPosition(accountId, marketId, sizeDelta);
        requestId = _recordLiveIntent(accountId, marketId, side, sizeDelta, 0, markPrice, true);
    }

    function openPositionDemo(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral)
        external
        nonReentrant
        returns (uint256 fillPrice)
    {
        _requireValidSide(side, sizeDelta);
        fillPrice = _checkTrade(accountId, marketId, sizeDelta, collateral);
        _applyFill(accountId, marketId, sizeDelta, collateral, fillPrice);
        emit PositionFilled(accountId, 0, marketId, FillMode.DEMO, sizeDelta, fillPrice);
        emit DemoFill(accountId, marketId, fillPrice, sizeDelta);
    }

    function closePositionDemo(uint256 accountId, uint256 marketId, int256 sizeDelta)
        external
        nonReentrant
        returns (uint256 fillPrice)
    {
        _requireCloseSize(sizeDelta);
        fillPrice = _checkTrade(accountId, marketId, sizeDelta, 0);
        _requireClosingPosition(accountId, marketId, sizeDelta);
        _applyFill(accountId, marketId, sizeDelta, 0, fillPrice);
        emit PositionFilled(accountId, 0, marketId, FillMode.DEMO, sizeDelta, fillPrice);
        emit DemoFill(accountId, marketId, fillPrice, sizeDelta);
    }

    function reconcileFill(uint256 accountId, uint256 requestId, uint256 marketId, int256 sizeDelta, uint256 fillPrice)
        external
        nonReentrant
        onlyRole(RECONCILER_ROLE)
    {
        OrderData storage order = orders[accountId][requestId];
        if (order.status == OrderStatus.NONE) revert InvalidOrder(accountId, requestId);
        if (order.status != OrderStatus.PENDING) revert InvalidOrderStatus(accountId, requestId, order.status);
        if (order.marketId != marketId || order.sizeDelta != sizeDelta || fillPrice == 0) {
            revert InvalidOrder(accountId, requestId);
        }

        order.status = OrderStatus.FILLED;
        order.fillPrice = fillPrice;
        order.filledAt = block.timestamp;
        accounts[accountId].pendingOrders -= 1;

        _applyFill(accountId, marketId, sizeDelta, order.collateral, fillPrice);
        emit PositionFilled(accountId, requestId, marketId, FillMode.LIVE, sizeDelta, fillPrice);
    }

    function payout(uint256 accountId, address recipient)
        external
        nonReentrant
        returns (uint256 traderAmount, uint256 protocolAmount)
    {
        if (recipient == address(0)) revert ZeroAddress();
        AccountData storage account = _activeAccount(accountId);
        _requireFundedState(accountId);
        _requireAuthorized(accountId, account.owner);
        if (activeMarkets[accountId].length != 0) revert OpenPositions(accountId);
        if (account.pendingOrders != 0) revert PendingOrders(accountId);

        uint256 equity = _computeEquity(accountId);
        if (equity <= account.startingBalance) revert NoProfit(accountId);

        uint256 profit = equity - account.startingBalance;
        traderAmount = (profit * traderShareBps) / BPS;
        protocolAmount = profit - traderAmount;

        uint256 requiredBalance = totalReservedCollateral + profit;
        uint256 available = settlementToken.balanceOf(address(this));
        if (available < requiredBalance) revert InsufficientVaultLiquidity(requiredBalance, available);

        account.currentEquity = equity;
        registry.setState(accountId, IAccountRegistry.AccountState.PAYOUT);

        settlementToken.safeTransfer(recipient, traderAmount);
        settlementToken.safeTransfer(protocolTreasury, protocolAmount);

        emit PayoutClaimed(accountId, recipient, traderAmount, protocolAmount);
    }

    function cancelOrder(uint256 accountId, uint256 requestId) external onlyRole(RECONCILER_ROLE) {
        OrderData storage order = orders[accountId][requestId];
        if (order.status == OrderStatus.NONE) revert InvalidOrder(accountId, requestId);
        if (order.status != OrderStatus.PENDING) revert InvalidOrderStatus(accountId, requestId, order.status);

        order.status = OrderStatus.CANCELLED;
        accounts[accountId].pendingOrders -= 1;
        emit OrderCancelled(accountId, requestId);
    }

    function setMarketSizeDecimals(uint256 marketId, uint8 sizeDecimals) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (sizeDecimals > 18) revert InvalidMarketDecimals(sizeDecimals);
        marketSizeDecimals[marketId] = sizeDecimals;
        emit MarketSizeDecimalsSet(marketId, sizeDecimals);
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
        AccountData storage account = _account(accountId);
        return (
            account.startingBalance,
            _computeEquity(accountId),
            account.peakEquity,
            account.dayStartEquity,
            activeMarkets[accountId].length,
            account.committedCollateral
        );
    }

    function getAccount(uint256 accountId) external view returns (AccountViewData memory viewData) {
        AccountData storage account = _account(accountId);
        viewData = AccountViewData({
            owner: account.owner,
            startingBalance: account.startingBalance,
            realizedPnl: account.realizedPnl,
            equity: _computeEquity(accountId),
            peakEquity: account.peakEquity,
            dayStartEquity: account.dayStartEquity,
            dayBucket: account.dayBucket,
            committedCollateral: account.committedCollateral,
            reservedCollateral: account.reservedCollateral,
            pendingOrders: account.pendingOrders,
            state: registry.stateOf(accountId),
            openPositions: activeMarkets[accountId].length
        });
    }

    function getOrder(uint256 accountId, uint256 requestId) external view returns (OrderData memory) {
        OrderData memory order = orders[accountId][requestId];
        if (order.status == OrderStatus.NONE) revert InvalidOrder(accountId, requestId);
        return order;
    }

    function getDrawdown(uint256 accountId) external view returns (uint256 dailyBps, uint256 totalBps) {
        AccountData storage account = _account(accountId);
        uint256 equity = _computeEquity(accountId);

        if (account.dayStartEquity > equity && account.dayStartEquity > 0) {
            dailyBps = ((account.dayStartEquity - equity) * BPS) / account.dayStartEquity;
        }
        if (account.peakEquity > equity && account.peakEquity > 0) {
            totalBps = ((account.peakEquity - equity) * BPS) / account.peakEquity;
        }
    }

    function positionOf(uint256 accountId, uint256 marketId) external view returns (PositionData memory) {
        _account(accountId);
        return positions[accountId][marketId];
    }

    function activeMarketIds(uint256 accountId) external view returns (uint256[] memory) {
        _account(accountId);
        return activeMarkets[accountId];
    }

    function _checkTrade(uint256 accountId, uint256 marketId, int256 sizeDelta, uint256 collateral)
        private
        returns (uint256 markPrice)
    {
        AccountData storage account = _activeAccount(accountId);
        _requireFundedState(accountId);
        _requireAuthorized(accountId, account.owner);

        uint8 priceDecimals;
        (markPrice, priceDecimals,) = _freshPrice(marketId);

        (bool ok, string memory reason) = ruleEngine.checkTrade(accountId, sizeDelta, collateral, markPrice);
        require(ok, reason);

        uint256 preTradeEquity = _computeEquity(accountId);
        _rollDayIfNeeded(account, preTradeEquity);
        if (priceDecimals > 18) revert InvalidMarketDecimals(priceDecimals);
    }

    function _recordLiveIntent(
        uint256 accountId,
        uint256 marketId,
        Side side,
        int256 sizeDelta,
        uint256 collateral,
        uint256 markPrice,
        bool isClose
    ) private returns (uint256 requestId) {
        requestId = nextRequestId[accountId]++;
        orders[accountId][requestId] = OrderData({
            requestId: requestId,
            marketId: marketId,
            side: side,
            sizeDelta: sizeDelta,
            collateral: collateral,
            markPrice: markPrice,
            fillPrice: 0,
            status: OrderStatus.PENDING,
            createdAt: block.timestamp,
            filledAt: 0,
            isClose: isClose
        });
        accounts[accountId].pendingOrders += 1;

        emit LivePositionIntent(accountId, requestId, marketId, side, sizeDelta, collateral);
    }

    function _applyFill(uint256 accountId, uint256 marketId, int256 sizeDelta, uint256 collateral, uint256 rawFillPrice)
        private
    {
        AccountData storage account = accounts[accountId];
        (, uint8 priceDecimals,) = priceAdapter.getPrice(marketId);
        if (priceDecimals > 18) revert InvalidMarketDecimals(priceDecimals);

        uint256 fillPriceX18 = _normalizePrice(rawFillPrice, priceDecimals);
        _applyPositionChange(accountId, marketId, sizeDelta, collateral, fillPriceX18);

        uint256 newEquity = _computeEquity(accountId);
        account.currentEquity = newEquity;
        if (newEquity > account.peakEquity) account.peakEquity = newEquity;
    }

    function _requireFundedState(uint256 accountId) private view {
        IAccountRegistry.AccountState state = registry.stateOf(accountId);
        if (state != IAccountRegistry.AccountState.FUNDED) revert InvalidAccountState(accountId, state);
    }

    function _requireAuthorized(uint256 accountId, address accountOwner) private view {
        if (msg.sender == accountOwner) return;
        if (!registry.isAuthorizedSigner(accountId, msg.sender)) revert UnauthorizedSigner(accountId, msg.sender);
    }

    function _requireValidSide(Side side, int256 sizeDelta) private pure {
        if (sizeDelta == 0) revert InvalidSizeDelta();
        if (side == Side.LONG && sizeDelta <= 0) revert InvalidSizeDelta();
        if (side == Side.SHORT && sizeDelta >= 0) revert InvalidSizeDelta();
    }

    function _requireCloseSize(int256 sizeDelta) private pure {
        if (sizeDelta == 0) revert InvalidSizeDelta();
    }

    function _requireClosingPosition(uint256 accountId, uint256 marketId, int256 sizeDelta) private view {
        int256 currentSize = positions[accountId][marketId].size;
        bool reducesLong = currentSize > 0 && sizeDelta < 0 && _abs(sizeDelta) <= _abs(currentSize);
        bool reducesShort = currentSize < 0 && sizeDelta > 0 && _abs(sizeDelta) <= _abs(currentSize);
        if (!reducesLong && !reducesShort) {
            revert InvalidClosePosition(accountId, marketId, currentSize, sizeDelta);
        }
    }

    function _freshPrice(uint256 marketId) private view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        if (priceAdapter.isStale(marketId, maxPriceAge)) revert StalePrice(marketId);
        (price, decimals, updatedAt) = priceAdapter.getPrice(marketId);
        if (price == 0 || updatedAt == 0) revert InvalidPrice(marketId);
        if (decimals > 18) revert InvalidMarketDecimals(decimals);
    }

    function _normalizePrice(uint256 price, uint8 decimals) private pure returns (uint256) {
        if (decimals == 18) return price;
        if (decimals < 18) return price * (10 ** (18 - decimals));
        return price / (10 ** (decimals - 18));
    }

    function _rollDayIfNeeded(AccountData storage account, uint256 preTradeEquity) private {
        uint256 today = block.timestamp / 1 days;
        if (today != account.dayBucket) {
            account.dayBucket = today;
            account.dayStartEquity = preTradeEquity;
        }
    }

    function _applyPositionChange(
        uint256 accountId,
        uint256 marketId,
        int256 sizeDelta,
        uint256 collateral,
        uint256 markPriceX18
    ) private {
        AccountData storage account = accounts[accountId];
        PositionData storage position = positions[accountId][marketId];
        int256 oldSize = position.size;

        if (oldSize == 0) {
            _setPosition(accountId, marketId, sizeDelta, markPriceX18, collateral);
            account.committedCollateral += collateral;
            return;
        }

        bool sameDirection = (oldSize > 0 && sizeDelta > 0) || (oldSize < 0 && sizeDelta < 0);
        if (sameDirection) {
            uint256 oldAbs = _abs(oldSize);
            uint256 addAbs = _abs(sizeDelta);
            position.avgEntryPriceX18 =
                ((oldAbs * position.avgEntryPriceX18) + (addAbs * markPriceX18)) / (oldAbs + addAbs);
            position.size = oldSize + sizeDelta;
            position.collateral += collateral;
            account.committedCollateral += collateral;
            return;
        }

        uint256 closeAbs = _min(_abs(oldSize), _abs(sizeDelta));
        account.realizedPnl += _realizedPnl(closeAbs, position.avgEntryPriceX18, markPriceX18, oldSize > 0, marketId);

        uint256 releasedCollateral = (position.collateral * closeAbs) / _abs(oldSize);
        position.collateral -= releasedCollateral;
        account.committedCollateral -= releasedCollateral;

        int256 newSize = oldSize + sizeDelta;
        if (newSize == 0) {
            _removePosition(accountId, marketId);
            return;
        }

        bool flipped = (oldSize > 0 && newSize < 0) || (oldSize < 0 && newSize > 0);
        if (flipped) {
            _setPosition(accountId, marketId, newSize, markPriceX18, collateral);
            account.committedCollateral += collateral;
        } else {
            position.size = newSize;
        }
    }

    function _setPosition(
        uint256 accountId,
        uint256 marketId,
        int256 size,
        uint256 avgEntryPriceX18,
        uint256 collateral
    ) private {
        PositionData storage position = positions[accountId][marketId];
        if (position.size == 0 && size != 0) _addActiveMarket(accountId, marketId);

        position.size = size;
        position.avgEntryPriceX18 = avgEntryPriceX18;
        position.collateral = collateral;
    }

    function _addActiveMarket(uint256 accountId, uint256 marketId) private {
        if (activeMarketIndexPlusOne[accountId][marketId] != 0) return;
        activeMarkets[accountId].push(marketId);
        activeMarketIndexPlusOne[accountId][marketId] = activeMarkets[accountId].length;
    }

    function _removePosition(uint256 accountId, uint256 marketId) private {
        delete positions[accountId][marketId];

        uint256 indexPlusOne = activeMarketIndexPlusOne[accountId][marketId];
        if (indexPlusOne == 0) return;

        uint256 index = indexPlusOne - 1;
        uint256[] storage markets = activeMarkets[accountId];
        uint256 lastMarketId = markets[markets.length - 1];

        if (index != markets.length - 1) {
            markets[index] = lastMarketId;
            activeMarketIndexPlusOne[accountId][lastMarketId] = indexPlusOne;
        }

        markets.pop();
        delete activeMarketIndexPlusOne[accountId][marketId];
    }

    function _computeEquity(uint256 accountId) private view returns (uint256) {
        AccountData storage account = accounts[accountId];
        int256 equity = int256(account.startingBalance) + account.realizedPnl;

        uint256[] storage markets = activeMarkets[accountId];
        for (uint256 i = 0; i < markets.length; i++) {
            uint256 marketId = markets[i];
            PositionData storage position = positions[accountId][marketId];
            (uint256 rawPrice, uint8 priceDecimals,) = priceAdapter.getPrice(marketId);
            if (rawPrice == 0) continue;
            uint256 markPriceX18 = _normalizePrice(rawPrice, priceDecimals);
            equity += _unrealizedPnl(position, markPriceX18, marketId);
        }

        if (equity <= 0) return 0;
        return SafeCast.toUint256(equity);
    }

    function _unrealizedPnl(PositionData storage position, uint256 markPriceX18, uint256 marketId)
        private
        view
        returns (int256)
    {
        if (position.size == 0) return 0;
        return _realizedPnl(_abs(position.size), position.avgEntryPriceX18, markPriceX18, position.size > 0, marketId);
    }

    function _realizedPnl(uint256 sizeAbs, uint256 entryPriceX18, uint256 markPriceX18, bool wasLong, uint256 marketId)
        private
        view
        returns (int256)
    {
        if (markPriceX18 == entryPriceX18 || sizeAbs == 0) return 0;

        uint256 positiveDelta =
            markPriceX18 > entryPriceX18 ? markPriceX18 - entryPriceX18 : entryPriceX18 - markPriceX18;
        uint256 quoteAmount = _quoteValue(sizeAbs, positiveDelta, marketId);
        bool profitable = wasLong ? markPriceX18 > entryPriceX18 : markPriceX18 < entryPriceX18;

        int256 signedQuoteAmount = SafeCast.toInt256(quoteAmount);
        return profitable ? signedQuoteAmount : -signedQuoteAmount;
    }

    function _quoteValue(uint256 sizeAbs, uint256 priceX18, uint256 marketId) private view returns (uint256) {
        uint256 sizeUnit = 10 ** marketSizeDecimals[marketId];
        return (sizeAbs * priceX18 * (10 ** QUOTE_DECIMALS)) / (sizeUnit * PRICE_UNIT);
    }

    function _activeAccount(uint256 accountId) private view returns (AccountData storage account) {
        account = _account(accountId);
        if (!account.activated) revert UnknownAccount(accountId);
    }

    function _account(uint256 accountId) private view returns (AccountData storage account) {
        account = accounts[accountId];
        if (account.owner == address(0)) revert UnknownAccount(accountId);
    }

    function _abs(int256 value) private pure returns (uint256) {
        if (value >= 0) return SafeCast.toUint256(value);
        if (value == type(int256).min) revert InvalidSizeDelta();
        return SafeCast.toUint256(-value);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
