import {parseAbi} from "viem";

export const accountRegistryAbi = parseAbi([
  "event AccountRegistered(uint256 indexed accountId, address indexed owner)",
  "event SignerAuthorized(uint256 indexed accountId, address indexed signer)",
  "event SignerRevoked(uint256 indexed accountId, address indexed signer)",
  "event StateChanged(uint256 indexed accountId, uint8 from, uint8 to)",
  "function ownerOf(uint256 accountId) view returns (address)",
  "function isAuthorizedSigner(uint256 accountId, address signer) view returns (bool)",
  "function stateOf(uint256 accountId) view returns (uint8)",
  "function authorizeSigner(uint256 accountId, address signer)",
  "function revokeSigner(uint256 accountId, address signer)"
]);

export const priceAdapterAbi = parseAbi([
  "event PricePushed(uint256 indexed marketId, uint256 price, uint8 decimals, uint256 timestamp)",
  "function getPrice(uint256 marketId) view returns (uint256 price, uint8 decimals, uint256 updatedAt)",
  "function isStale(uint256 marketId, uint256 maxAge) view returns (bool)"
]);

export const examinationVaultAbi = parseAbi([
  "event ExaminationPurchased(uint256 indexed accountId, address indexed owner, uint256 accountSize, uint256 feePaid)",
  "event PaperEntryRecorded(uint256 indexed accountId, uint256 indexed marketId, address indexed signer, uint8 side, int256 sizeDelta, uint256 collateral, uint256 markPrice)",
  "event EntryRecorded(uint256 indexed accountId, uint256 indexed marketId, int256 sizeDelta, uint256 markPrice, uint256 newEquity)",
  "event ExaminationResolved(uint256 indexed accountId, bool passed, bool failed)",
  "event ExaminationPassed(uint256 indexed accountId)",
  "event ExaminationFailed(uint256 indexed accountId, string reason)",
  "function buyExamination(uint256 accountSize) payable returns (uint256 accountId)",
  "function recordEntry(uint256 accountId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral) returns (uint256 markPrice)",
  "function resolve(uint256 accountId) returns (bool passed, bool failed)",
  "function getAccount(uint256 accountId) view returns ((address owner, uint256 startingBalance, int256 realizedPnl, uint256 equity, uint256 peakEquity, uint256 dayStartEquity, uint256 dayBucket, uint256 committedCollateral, uint8 state, uint256 entryCount, uint256 openPositions))",
  "function getDrawdown(uint256 accountId) view returns (uint256 dailyBps, uint256 totalBps)",
  "function getEntries(uint256 accountId) view returns ((uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral, uint256 markPrice, uint256 timestamp, bool isClose, uint256 equityAfter)[])",
  "function getRuleStatus(uint256 accountId) view returns (bool passed, bool failed)",
  "function positionOf(uint256 accountId, uint256 marketId) view returns ((int256 size, uint256 avgEntryPriceX18, uint256 collateral))",
  "function activeMarketIds(uint256 accountId) view returns (uint256[])"
]);

export const fundedVaultAbi = parseAbi([
  "event FundedAccountActivated(uint256 indexed accountId, address indexed owner)",
  "event LivePositionIntent(uint256 indexed accountId, uint256 indexed requestId, uint256 indexed marketId, uint8 side, int256 sizeDelta, uint256 collateral)",
  "event PositionFilled(uint256 indexed accountId, uint256 indexed requestId, uint256 indexed marketId, uint8 mode, int256 sizeDelta, uint256 fillPrice)",
  "event DemoFill(uint256 indexed accountId, uint256 indexed marketId, uint256 price, int256 sizeDelta)",
  "event PayoutClaimed(uint256 indexed accountId, address indexed recipient, uint256 traderAmount, uint256 protocolAmount)",
  "function activate(uint256 accountId)",
  "function openPositionLive(uint256 accountId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral) returns (uint256 requestId)",
  "function closePositionLive(uint256 accountId, uint256 marketId, int256 sizeDelta) returns (uint256 requestId)",
  "function openPositionDemo(uint256 accountId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral) returns (uint256 fillPrice)",
  "function closePositionDemo(uint256 accountId, uint256 marketId, int256 sizeDelta) returns (uint256 fillPrice)",
  "function payout(uint256 accountId, address recipient) returns (uint256 traderAmount, uint256 protocolAmount)",
  "function getAccount(uint256 accountId) view returns ((address owner, uint256 startingBalance, int256 realizedPnl, uint256 equity, uint256 peakEquity, uint256 dayStartEquity, uint256 dayBucket, uint256 committedCollateral, uint256 reservedCollateral, uint256 pendingOrders, uint8 state, uint256 openPositions))",
  "function getOrder(uint256 accountId, uint256 requestId) view returns ((uint256 requestId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral, uint256 markPrice, uint256 fillPrice, uint8 status, uint256 createdAt, uint256 filledAt, bool isClose))",
  "function getDrawdown(uint256 accountId) view returns (uint256 dailyBps, uint256 totalBps)",
  "function positionOf(uint256 accountId, uint256 marketId) view returns ((int256 size, uint256 avgEntryPriceX18, uint256 collateral))",
  "function activeMarketIds(uint256 accountId) view returns (uint256[])"
]);
