// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAccountRegistry} from "../interfaces/IAccountRegistry.sol";
import {IExaminationVault} from "../interfaces/IExaminationVault.sol";
import {IPerplPriceAdapter} from "../interfaces/IPerplPriceAdapter.sol";
import {IRuleEngine} from "../interfaces/IRuleEngine.sol";

/// @title ExaminationVault
/// @notice On-chain paper-trading ledger for Propmon examination accounts.
contract ExaminationVault is IExaminationVault, Ownable, ReentrancyGuard {
    uint256 public constant EXAM_FEE_BPS = 100;
    uint256 public constant BPS = 10_000;
    uint8 public constant QUOTE_DECIMALS = 6;
    uint256 private constant PRICE_UNIT = 1e18;

    IAccountRegistry public immutable registry;
    IPerplPriceAdapter public immutable priceAdapter;
    IRuleEngine public immutable ruleEngine;

    uint256 public immutable maxPriceAge;
    uint256 public immutable defaultRuleTierId;

    struct Entry {
        uint256 marketId;
        Side side;
        int256 sizeDelta;
        uint256 collateral;
        uint256 markPrice;
        uint256 timestamp;
        bool isClose;
        uint256 equityAfter;
    }

    struct AccountData {
        address owner;
        uint256 startingBalance;
        int256 realizedPnl;
        uint256 currentEquity;
        uint256 peakEquity;
        uint256 dayStartEquity;
        uint256 dayBucket;
        uint256 committedCollateral;
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
        IAccountRegistry.AccountState state;
        uint256 entryCount;
        uint256 openPositions;
    }

    struct PositionData {
        int256 size;
        uint256 avgEntryPriceX18;
        uint256 collateral;
    }

    error ZeroAddress();
    error InvalidAccountSize();
    error IncorrectFee(uint256 expected, uint256 actual);
    error UnknownAccount(uint256 accountId);
    error UnauthorizedSigner(uint256 accountId, address signer);
    error InvalidAccountState(uint256 accountId, IAccountRegistry.AccountState state);
    error StalePrice(uint256 marketId);
    error InvalidPrice(uint256 marketId);
    error InvalidSizeDelta();
    error InvalidMarketDecimals(uint8 decimals);

    event EntryRecorded(
        uint256 indexed accountId, uint256 indexed marketId, int256 sizeDelta, uint256 markPrice, uint256 newEquity
    );
    event ExaminationPassed(uint256 indexed accountId);
    event ExaminationFailed(uint256 indexed accountId, string reason);
    event MarketSizeDecimalsSet(uint256 indexed marketId, uint8 sizeDecimals);

    mapping(uint256 accountId => AccountData account) private accounts;
    mapping(uint256 accountId => Entry[] accountEntries) private entries;
    mapping(uint256 accountId => mapping(uint256 marketId => PositionData position)) private positions;
    mapping(uint256 accountId => uint256[] marketIds) private activeMarkets;
    mapping(uint256 accountId => mapping(uint256 marketId => uint256 indexPlusOne)) private activeMarketIndexPlusOne;
    mapping(uint256 marketId => uint8 sizeDecimals) public marketSizeDecimals;

    constructor(
        IAccountRegistry registry_,
        IPerplPriceAdapter priceAdapter_,
        IRuleEngine ruleEngine_,
        uint256 maxPriceAge_,
        uint256 defaultRuleTierId_,
        address owner_
    ) Ownable(owner_) {
        if (
            address(registry_) == address(0) || address(priceAdapter_) == address(0)
                || address(ruleEngine_) == address(0)
        ) {
            revert ZeroAddress();
        }
        if (owner_ == address(0)) revert ZeroAddress();

        registry = registry_;
        priceAdapter = priceAdapter_;
        ruleEngine = ruleEngine_;
        maxPriceAge = maxPriceAge_;
        defaultRuleTierId = defaultRuleTierId_;
    }

    function buyExamination(uint256 accountSize) external payable nonReentrant returns (uint256 accountId) {
        if (accountSize == 0) revert InvalidAccountSize();

        uint256 expectedFee = (accountSize * EXAM_FEE_BPS) / BPS;
        if (msg.value != expectedFee) revert IncorrectFee(expectedFee, msg.value);

        accountId = registry.register(msg.sender);
        uint256 dayBucket = block.timestamp / 1 days;

        accounts[accountId] = AccountData({
            owner: msg.sender,
            startingBalance: accountSize,
            realizedPnl: 0,
            currentEquity: accountSize,
            peakEquity: accountSize,
            dayStartEquity: accountSize,
            dayBucket: dayBucket,
            committedCollateral: 0
        });

        ruleEngine.configureAccount(accountId, defaultRuleTierId, address(this));
        emit ExaminationPurchased(accountId, msg.sender, accountSize, msg.value);
    }

    function recordEntry(uint256 accountId, uint256 marketId, Side side, int256 sizeDelta, uint256 collateral)
        external
        returns (uint256 markPrice)
    {
        AccountData storage account = _account(accountId);
        _requireExaminationState(accountId);
        _requireAuthorized(accountId, account.owner);
        _requireValidSide(side, sizeDelta);

        uint8 priceDecimals;
        (markPrice, priceDecimals,) = _freshPrice(marketId);
        uint256 markPriceX18 = _normalizePrice(markPrice, priceDecimals);

        _requireRuleCheck(accountId, marketId, sizeDelta, collateral, markPrice, priceDecimals);

        uint256 preTradeEquity = _computeEquity(accountId);
        _rollDayIfNeeded(account, preTradeEquity);

        bool isClose = _applyPositionChange(accountId, marketId, sizeDelta, collateral, markPriceX18);
        uint256 newEquity = _computeEquity(accountId);
        account.currentEquity = newEquity;
        if (newEquity > account.peakEquity) account.peakEquity = newEquity;

        entries[accountId].push(
            Entry({
                marketId: marketId,
                side: side,
                sizeDelta: sizeDelta,
                collateral: collateral,
                markPrice: markPrice,
                timestamp: block.timestamp,
                isClose: isClose,
                equityAfter: newEquity
            })
        );

        emit PaperEntryRecorded(accountId, marketId, msg.sender, side, sizeDelta, collateral, markPrice);
        emit EntryRecorded(accountId, marketId, sizeDelta, markPrice, newEquity);

        resolve(accountId);
    }

    function resolve(uint256 accountId) public returns (bool passed, bool failed) {
        _account(accountId);

        (passed, failed) = ruleEngine.evaluatePassFail(accountId);
        if (failed) {
            registry.setState(accountId, IAccountRegistry.AccountState.FAILED);
            emit ExaminationFailed(accountId, "RULE_ENGINE_FAILED");
        } else if (passed) {
            registry.setState(accountId, IAccountRegistry.AccountState.PASSED);
            emit ExaminationPassed(accountId);
        }

        emit ExaminationResolved(accountId, passed && !failed, failed);
        return (passed && !failed, failed);
    }

    function setMarketSizeDecimals(uint256 marketId, uint8 sizeDecimals) external onlyOwner {
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
            state: registry.stateOf(accountId),
            entryCount: entries[accountId].length,
            openPositions: activeMarkets[accountId].length
        });
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

    function getEntries(uint256 accountId) external view returns (Entry[] memory) {
        _account(accountId);
        return entries[accountId];
    }

    function getRuleStatus(uint256 accountId) external view returns (bool passed, bool failed) {
        _account(accountId);
        return ruleEngine.evaluatePassFail(accountId);
    }

    function positionOf(uint256 accountId, uint256 marketId) external view returns (PositionData memory) {
        _account(accountId);
        return positions[accountId][marketId];
    }

    function activeMarketIds(uint256 accountId) external view returns (uint256[] memory) {
        _account(accountId);
        return activeMarkets[accountId];
    }

    function _requireRuleCheck(
        uint256 accountId,
        uint256 marketId,
        int256 sizeDelta,
        uint256 collateral,
        uint256 markPrice,
        uint8 priceDecimals
    ) private view {
        (bool ok, string memory reason) = ruleEngine.checkTradeDetailed(
            IRuleEngine.TradeCheckInput({
                accountId: accountId,
                marketId: marketId,
                sizeDelta: sizeDelta,
                collateral: collateral,
                markPrice: markPrice,
                priceDecimals: priceDecimals,
                sizeDecimals: marketSizeDecimals[marketId],
                opensNewPosition: positions[accountId][marketId].size == 0
            })
        );
        require(ok, reason);
    }

    function _account(uint256 accountId) private view returns (AccountData storage account) {
        account = accounts[accountId];
        if (account.owner == address(0)) revert UnknownAccount(accountId);
    }

    function _requireExaminationState(uint256 accountId) private view {
        IAccountRegistry.AccountState state = registry.stateOf(accountId);
        if (state != IAccountRegistry.AccountState.EXAMINATION) revert InvalidAccountState(accountId, state);
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
    ) private returns (bool isClose) {
        AccountData storage account = accounts[accountId];
        PositionData storage position = positions[accountId][marketId];
        int256 oldSize = position.size;

        if (oldSize == 0) {
            _setPosition(accountId, marketId, sizeDelta, markPriceX18, collateral);
            account.committedCollateral += collateral;
            return false;
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
            return false;
        }

        uint256 closeAbs = _min(_abs(oldSize), _abs(sizeDelta));
        account.realizedPnl += _realizedPnl(closeAbs, position.avgEntryPriceX18, markPriceX18, oldSize > 0, marketId);

        uint256 releasedCollateral = (position.collateral * closeAbs) / _abs(oldSize);
        position.collateral -= releasedCollateral;
        account.committedCollateral -= releasedCollateral;
        isClose = true;

        int256 newSize = oldSize + sizeDelta;
        if (newSize == 0) {
            _removePosition(accountId, marketId);
            return true;
        }

        bool flipped = (oldSize > 0 && newSize < 0) || (oldSize < 0 && newSize > 0);
        if (flipped) {
            _setPosition(accountId, marketId, newSize, markPriceX18, collateral);
            account.committedCollateral += collateral;
        } else {
            position.size = newSize;
        }

        return true;
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

    function _abs(int256 value) private pure returns (uint256) {
        if (value >= 0) return SafeCast.toUint256(value);
        if (value == type(int256).min) revert InvalidSizeDelta();
        return SafeCast.toUint256(-value);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
