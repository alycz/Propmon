// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPerplPriceAdapter} from "../interfaces/IPerplPriceAdapter.sol";

/// @title PerplPriceAdapter
/// @notice Stores latest Perpl mark prices on-chain for examination and demo-funded accounting.
contract PerplPriceAdapter is IPerplPriceAdapter, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    struct PriceData {
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
    }

    error InvalidPrice();
    error InvalidDecimals();

    event PricePushed(uint256 indexed marketId, uint256 price, uint8 decimals, uint256 timestamp);

    mapping(uint256 marketId => PriceData priceData) private prices;

    constructor(address admin, address relayer) {
        require(admin != address(0), "PerplPriceAdapter: admin zero");
        require(relayer != address(0), "PerplPriceAdapter: relayer zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    function pushPrice(uint256 marketId, uint256 price, uint8 decimals) external onlyRole(RELAYER_ROLE) {
        if (price == 0) revert InvalidPrice();
        if (decimals > 18) revert InvalidDecimals();

        uint256 timestamp = block.timestamp;
        prices[marketId] = PriceData({price: price, decimals: decimals, updatedAt: timestamp});
        emit PricePushed(marketId, price, decimals, timestamp);
    }

    function getPrice(uint256 marketId) external view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        PriceData memory priceData = prices[marketId];
        return (priceData.price, priceData.decimals, priceData.updatedAt);
    }

    function isStale(uint256 marketId, uint256 maxAge) external view returns (bool) {
        PriceData memory priceData = prices[marketId];
        if (priceData.updatedAt == 0) return true;
        return block.timestamp > priceData.updatedAt + maxAge;
    }
}
