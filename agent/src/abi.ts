import {parseAbi} from "viem";

export const accountRegistryAbi = parseAbi([
  "function isAuthorizedSigner(uint256 accountId, address signer) view returns (bool)",
  "function stateOf(uint256 accountId) view returns (uint8)",
  "function ownerOf(uint256 accountId) view returns (address)",
  "function authorizeSigner(uint256 accountId, address signer)"
]);

export const examinationVaultAbi = parseAbi([
  "function recordEntry(uint256 accountId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral) returns (uint256 markPrice)",
  "function resolve(uint256 accountId) returns (bool passed, bool failed)",
  "function buyExamination(uint256 accountSize) payable returns (uint256 accountId)",
  "function getRuleStatus(uint256 accountId) view returns (bool passed, bool failed)"
]);

export const fundedVaultAbi = parseAbi([
  "event LivePositionIntent(uint256 indexed accountId, uint256 indexed requestId, uint256 indexed marketId, uint8 side, int256 sizeDelta, uint256 collateral)",
  "function activate(uint256 accountId)",
  "function openPositionLive(uint256 accountId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral) returns (uint256 requestId)",
  "function closePositionLive(uint256 accountId, uint256 marketId, int256 sizeDelta) returns (uint256 requestId)",
  "function openPositionDemo(uint256 accountId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral) returns (uint256 fillPrice)",
  "function closePositionDemo(uint256 accountId, uint256 marketId, int256 sizeDelta) returns (uint256 fillPrice)",
  "function reconcileFill(uint256 accountId, uint256 requestId, uint256 marketId, int256 sizeDelta, uint256 fillPrice)",
  "function payout(uint256 accountId, address recipient) returns (uint256 traderAmount, uint256 protocolAmount)",
  "function getOrder(uint256 accountId, uint256 requestId) view returns ((uint256 requestId, uint256 marketId, uint8 side, int256 sizeDelta, uint256 collateral, uint256 markPrice, uint256 fillPrice, uint8 status, uint256 createdAt, uint256 filledAt, bool isClose))"
]);

export const priceAdapterAbi = parseAbi([
  "function getPrice(uint256 marketId) view returns (uint256 price, uint8 decimals, uint256 updatedAt)",
  "function isStale(uint256 marketId, uint256 maxAge) view returns (bool)",
  "function pushPrice(uint256 marketId, uint256 price, uint8 decimals)"
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address recipient, uint256 amount) returns (bool)"
]);

export const perplExchangeReadinessAbi = parseAbi([
  "function getAccountByAddr(address owner) view returns (uint256 accountId, uint256 lfr)",
  "function createAccount(uint256 refCode) returns (uint256 accountId)",
  "function deposit(uint256 accountId, uint256 amount)"
]);
