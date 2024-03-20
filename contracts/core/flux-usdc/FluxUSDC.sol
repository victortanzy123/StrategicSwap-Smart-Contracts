// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract FluxUSDC is ERC4626 {

    uint256 public immutable START_TIME;
    uint256 public constant ONE = 1e18; // 18 decimal places
    uint256 public INTEREST_BPS = 5 * ONE; // Fixed 5% APR
    uint256 public constant YEAR = 365 days;
    
    constructor(address asset_) ERC4626(IERC20(asset_)) ERC20("Flux USDC", 
    "fUSDC") {
        START_TIME = block.timestamp;
    }

     /**
     * @dev Internal conversion function (from assets to shares) with support for rounding direction.
     */
    function _convertToShares(uint256 assets, Math.Rounding) internal view override returns (uint256) {
        uint256 sharesToAssetRate = _calcExchangeRate(block.timestamp); // 10^18
        uint256 aInflated = assets * 100 * ONE;
          unchecked {
            return aInflated / sharesToAssetRate;
        }
    }

    /**
     * @dev Internal conversion function (from shares to assets) with support for rounding direction.
     */
    function _convertToAssets(uint256 shares, Math.Rounding) internal view override returns (uint256) {
        uint256 sharesToAssetRate = _calcExchangeRate(block.timestamp);
        uint256 product = shares * sharesToAssetRate;
         unchecked {
            return product / (100 * ONE);
        }
    }

    function _calcExchangeRate(uint256 timestamp) internal view returns(uint256 sharesToAssetRate) {
        require(timestamp > START_TIME, "Invalid timestamp");
        uint256 timeDiff = timestamp - START_TIME;
        sharesToAssetRate = ((timeDiff * INTEREST_BPS) / YEAR) + 100 * ONE; // BasisPoints in 100 * 10 ** 18
    }

     function exchangeRate() external view returns(uint256 sharesToAssetRate) {
        sharesToAssetRate = _calcExchangeRate(block.timestamp);
    }
}