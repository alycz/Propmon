// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPerplPriceAdapter
/// @notice On-chain Perpl mark/oracle price source used by examination and demo-funded accounting.
interface IPerplPriceAdapter {
    /// @param marketId Perpl market ID, for example BTC=16, ETH=32, MON=64 on Monad Testnet.
    /// @return price Scaled integer price.
    /// @return decimals Number of decimal places used by price.
    /// @return updatedAt Unix timestamp of the latest accepted update.
    function getPrice(uint256 marketId) external view returns (uint256 price, uint8 decimals, uint256 updatedAt);
}
