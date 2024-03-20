// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../../interfaces/IERC4626.sol";
import "../helpers/TokenHelper.sol";
import "../libraries/math/Math.sol";
import "./IPoolYieldStrategy.sol";

/*
Percentage of LP token -> % of stake in the reserves -> How to determine who gets how much?
If Time is added as a weight -> x  = block.timestamp - START_TIME

* -> Boosted APY for each EPOCH?

Formula: (Current Balance based on LP/ Total Current Balance) * 

*/

contract YieldStrategyManager is IPoolYieldStrategy, TokenHelper {
    using SafeERC20 for IERC20;
    using Math for uint256;

    struct AssetStrategy {
        address underlying;
        address yield;
    }

    AssetStrategy[] public assetStrategyList;

    /*
    Need to keep track of the last exchange rate? -> but what if deposit multiple times -> get the IMPLIED RATE -> % of tokens 
    Use absolute amount? since absolute amount directly impacts yield accrued -> CANNOT since its a pool it will change
    Base on percentage of DAI + last exchange rate

    */

    constructor(address token0_erc4626_, address token1_erc4626_) {
        address underlying0 = IERC4626(token0_erc4626_).asset();
        address underlying1 = IERC4626(token1_erc4626_).asset();

        AssetStrategy memory token0Strategy = AssetStrategy(underlying0, token0_erc4626_);
        assetStrategyList.push(token0Strategy);
        AssetStrategy memory token1Strategy = AssetStrategy(underlying1, token1_erc4626_);
        assetStrategyList.push(token1Strategy);

        IERC20(underlying0).safeApprove(token0_erc4626_, type(uint256).max);
        IERC20(underlying1).safeApprove(token1_erc4626_, type(uint256).max);
    }


    /// @dev Performs deposit of underlying from the ERC-4626 vault based on token index specified and amount.
    /// @param tokenIndex index of token registered in the pool
    /// @param amount specified amount of underlying
    function _depositToVault(uint8 tokenIndex, uint256 amount) internal returns(uint256 shares) {
        AssetStrategy memory strategy = _assetStrategyByTokenIndex(tokenIndex);
        shares = IERC4626(strategy.yield).deposit(amount, address(this));

        emit Deposit(strategy.yield, strategy.underlying, amount);
    }

    /// @dev Performs withdrawal of underlying from the ERC-4626 vault based on token index specified and amount.
    /// @param tokenIndex index of token registered in the pool
    /// @param amount specified amount of underlying
    /// @param to address to receive the withdrawn underlying
    function _withdrawFromVault(uint8 tokenIndex, uint256 amount, address to) internal {
        AssetStrategy memory strategy = _assetStrategyByTokenIndex(tokenIndex);
        uint256 sharesAmount = IERC4626(strategy.yield).withdraw(amount, to, address(this)); // Return the share amount needed

        emit Withdraw(strategy.yield, strategy.underlying, sharesAmount);
    }


    // Test helper
    function _previewRedeemSharesToAsset(uint8 tokenStrategyIndex) internal view returns(uint256 amount) {
        AssetStrategy memory strategy = _assetStrategyByTokenIndex(tokenStrategyIndex);
        // uint256 totalShares = _selfBalance(strategy.yield);
        // amount = IERC4626(strategy.yield).previewRedeem(totalShares);
        amount = IERC4626(strategy.yield).maxRedeem(address(this));
    }

    /// @dev Performs full withdrawal by redeeming all underlying stake from shares for the specified token index strategy.
    /// @param tokenIndex index of token registered in the pool
    function _selfWithdrawAll(uint8 tokenIndex) internal returns(uint256 assets) {
        AssetStrategy memory strategy = _assetStrategyByTokenIndex(tokenIndex);

        uint256 totalShares =IERC4626(strategy.yield).maxRedeem(address(this));
        assets = IERC4626(strategy.yield).redeem(totalShares, address(this), address(this));
        // assets = IERC4626(strategy.yield).maxWithdraw(address(this)); // MaxWithdraw only previews the total assets based on balance of shares (NOT A WITHDRAW ACTION)
        // uint256 totalShares = IERC4626(strategy.yield).withdraw(assets, address(this), address(this));
        
        emit Withdraw(strategy.yield, strategy.underlying, totalShares);
    }

    /// @dev Calculates amount of underlying stake owned based on the amount of shares owned and 
    /// @param tokenIndex index of token registered in the pool
    function _asset(uint8 tokenIndex) internal view returns (uint256 amount) {
        require(tokenIndex < assetStrategyList.length, "Invalid token index");
        AssetStrategy memory strategy = assetStrategyList[tokenIndex];
        amount = _assetFromShares(strategy.yield);
    }

    /// @dev Calculates amount of underlying (assets) from the amount of shares of the yield token address specified
    /// @param yieldToken address of yield token
    function _assetFromShares(address yieldToken) internal view returns (uint256 amount) {
        uint256 shares = _selfBalance(yieldToken);
        amount = IERC4626(yieldToken).previewRedeem(shares);
    }

    /// @dev Calculates shares/amount of yield token based on amount held by pool contract
    /// @param yieldToken address of yield token
    function _shares(address yieldToken) internal view returns (uint256 amount) {
        amount = _selfBalance(yieldToken);
    }

    /// @dev Calculates shares/amount of yield token based on amount held by pool contract
    /// @param tokenIndex index of token registered in the pool
    function _shares(uint8 tokenIndex) internal view returns (uint256 amount) {
        require(tokenIndex < assetStrategyList.length, "Invalid token index");
        AssetStrategy memory strategy = assetStrategyList[tokenIndex];
        amount = _selfBalance(strategy.yield);
    }

    /// @dev Get asset strategy struct that includes both addresses of the underlying and yield token of the strategy based on the token index specficied
    /// @param tokenIndex index of token registered in the pool
    function _assetStrategyByTokenIndex(uint8 tokenIndex) internal view returns(AssetStrategy memory strategy) {
        require(tokenIndex < assetStrategyList.length, "Invalid token index");
        strategy = assetStrategyList[tokenIndex];
    }

    /// @dev Get the total count of ERC-4626 Strategies
    function assetStrategiesLength() external view returns (uint256 length) {
        length = assetStrategyList.length;
    }

    /// @dev Get strategy overall amount of both underlying and yield tokens managed by pool contract
    /// @param tokenIndex index of token registered in the pool
    function strategyDetails(uint8 tokenIndex) external view returns (uint256 assetAmount, uint256 sharesAmount) {
        require(tokenIndex < assetStrategyList.length, "Invalid token index");
        AssetStrategy memory strategy = assetStrategyList[tokenIndex];
        assetAmount = _asset(tokenIndex);
        sharesAmount = _shares(strategy.yield);
    }


    /// @dev Get current exchange rate of yield to underlying from the ERC-4626 Vault contract based on token index specified.
    /// @param tokenIndex index of token registered in the pool
    function exchangeRate(uint8 tokenIndex) public view returns(uint256 rate) {
        require(tokenIndex < assetStrategyList.length, "Invalid token index");
        rate = IERC4626(assetStrategyList[tokenIndex].yield).convertToAssets(Math.ONE);
    }

    /// @dev Get both underlying and yield token metadata of strategy based on tokenIndex
    /// @param tokenIndex index of token registered in the pool
    function strategyMetadata(uint8 tokenIndex) external view returns(address underlying, uint8 underlyingDecimals, address yield, uint8 yieldDecimals) {
        require(tokenIndex < assetStrategyList.length, "Invalid token index");
        AssetStrategy memory strategy = assetStrategyList[tokenIndex];

        underlying = strategy.underlying;
        underlyingDecimals = IERC20Metadata(underlying).decimals();
        yield = strategy.yield;
        yieldDecimals = IERC20Metadata(yield).decimals();
    }
}