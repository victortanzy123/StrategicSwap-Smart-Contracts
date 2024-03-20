// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {PoolPairBase} from "./PoolPairBase.sol";
import {YieldStrategyManager} from "./strategies/YieldStrategyManager.sol";


contract StrategicPoolPairERC4626 is PoolPairBase, YieldStrategyManager{
    event EpochYieldHarvest(uint256 indexed epoch,uint256 token0Yield, uint256 token1Yield);

    struct EpochYield {
        uint256 token0Yield;
        uint256 token1Yield;
    }

    uint256 public constant EPOCH_INTERVAL = 30 days;
    uint256 public immutable START_TIME;

    mapping(uint256 => bool) public epochClaimed;
    mapping(uint256 => EpochYield) public epochYields;

    constructor(address token0_erc4626_, address token1_erc4626_) PoolPairBase(msg.sender) 
    YieldStrategyManager(token0_erc4626_, token1_erc4626_) {
        START_TIME = block.timestamp;
    }

      /// @dev One-Time executation of harvesting all uncollected rewards/yields from 
      /// both ERC-4626 Vault strategies upon an end of a EPOCH. Function can be called by any user.
    function harvestYieldsForRecentEpoch() external {
        uint256 prevEpoch = _calcEpochByTimestamp(block.timestamp) - 1;
        require(!epochClaimed[prevEpoch], "Epoch yields has been claimed");

        epochClaimed[prevEpoch] = true;
        (uint256 token0Yield, uint256 token1Yield) = _harvest();
        
        // Update Epoch Yield Claim Details
        epochYields[prevEpoch] = EpochYield(token0Yield, token1Yield);
        
        emit EpochYieldHarvest(prevEpoch, token0Yield, token1Yield);
    }

  /// TESTING*
    function previewHarvestDetails() external view returns (uint112 reserve0, uint256 token0Withdraw,uint256 shares0,uint256 previewShares0, uint112 reserve1, uint256 token1Withdraw, uint256 shares1, uint256 previewShares1) {
        (reserve0, reserve1,,) = getReserves();
        AssetStrategy memory strategy0 = _assetStrategyByTokenIndex(0);
        token0Withdraw = _assetFromShares(strategy0.yield);
        shares0 = _selfBalance(strategy0.yield);
        previewShares0 = _previewRedeemSharesToAsset(0);

        AssetStrategy memory strategy1 = _assetStrategyByTokenIndex(1);
        token1Withdraw = _assetFromShares(strategy1.yield);
        shares1 = _selfBalance(strategy1.yield);
        previewShares1 = _previewRedeemSharesToAsset(1);
    }

    /// @dev Core harvest function that first withdraws all underlying stake from the ERC-4626 Vaults,
    /// following by an update to the reserves with the collected yields and re-dposit back to the vaults.
    function _harvest() internal returns(uint256 token0Yield, uint256 token1Yield) {
        (uint112 reserve0, uint112 reserve1,,) = getReserves(); 
        // Since strictly 2 tokens:
        // token0Yield = _selfWithdrawAll(0);
        token0Yield = _selfWithdrawAll(0) - uint256(reserve0);
        _depositToVault(0, uint256(reserve0));
        // Update reserves with additional yield? -> Deposit all

        token1Yield = _selfWithdrawAll(1) - uint256(reserve1);
        _depositToVault(1, reserve1);
    }

    /// @dev Withdraws liquidity of both tokens based on burning the respective LP token.
    /// @notice Assumes user has given approval over 2 tokens.
    /// @param to address of receiver from LP token stake from depositing liquidity.
    /// @param amount0 amount of token0 to deposit as liquidity.
    /// @param amount1 amount of token1 to deposit as liquidity.
    function deposit(address to, uint256 amount0, uint256 amount1) external returns(uint256 liquidity) {
        // 1. Deposit tokens via `_deposit`
        _transferIn(token0, msg.sender, amount0);
        _transferIn(token1, msg.sender, amount1);
        liquidity = 0;
        liquidity = _deposit(to, amount0, amount1); // Updates PoolBase Ledger + Mints LP Tokens
        // 2. Deploy deposited liquidity into the respective vaults
        _depositToVault(0, amount0);
        _depositToVault(1, amount1);
    }

    /// @dev Withdraws liquidity of both tokens based on burning the respective LP token.
    /// @notice Assumes user has given approval to burn LP token on their behalf
    /// @param to address of receiver from removing liquidity
    /// @param liquidity  amount of LP token that represents liquidity stake of pool
    function withdraw(address to, uint256 liquidity) external returns(uint256 amount0, uint256 amount1) {
        // 1. Transfer in LP Token amount as 'liquidity' to pool contract
        _transferIn(address(this), msg.sender, liquidity);
        // 2. Calculate the respective amount to withdraw
        (amount0, amount1) = previewWithdrawLiquidityAmounts(liquidity);
        // 3. Withdraw respective amount from the vaults to contract
        _withdrawFromVault(0, amount0, address(this));
        _withdrawFromVault(1, amount1, address(this));
        // 2. Perform withdraw function
        _withdraw(to, liquidity); // Handle Distribution, Burning + Update of pool ledger
    }



    /// @dev Swap one token for the other by a trader by first withdrawal the amount of the corresponding token from the respective ERC-4626 Vault
    /// then facilitating the swap via updating states in the AMM pool, and depositing the trade-in token amount to the corresponding ERC-4626 Vault.
    /// @notice Either `amount0In` or `amount1In` should be  == 0 and assumes user has given approval to contract to transfer on his behalf for swap
    /// @param amountIn amount of token to trade in.
    /// @param tokenIn address of supported token to trade in
    /// @param to address to receive the corresponding swapped token for the given input token
    /// @param data bytes for additional function call data (optional)
    function swap(uint256 amountIn, address tokenIn, address to, bytes calldata data) external override {
        // 1. Pull out relevant amount from ERC4626 vault
        // Optimistically pull out of vault
        require(amountIn != 0, "Invalid token swap");
        require(tokenIn == token0 || tokenIn == token1, "Invalid tokenIn");

        // 1. Calculate amountOut of `tokenOut` via `previewAmountOut`
        uint256 amountOut = previewAmountOut(tokenIn, amountIn); // Formula of AMM calculated here
        uint8 tokenOutIndex = tokenIn == token0 ? 1 : 0;
        uint8 tokenInIndex = tokenIn == token0 ? 0 : 1;
        // 2. Withdraw amountOut from the respective vault
        _withdrawFromVault(tokenOutIndex, amountOut, address(this));

        // 3. Perform swap -> Does the `_transferIn` of tokenIn and `_transferOut` for tokenOut
        TokensData memory tokensData = TokensData({
            token0: token0,
            token1: token1,
            amount0In: tokenIn == token0 ? amountIn : 0,
            amount1In : tokenIn == token1 ? amountIn : 0,
            amount0Out: tokenIn == token0 ? 0 : amountOut,
            amount1Out: tokenIn == token1 ? 0 : amountOut,
            balance0: 0,
            balance1: 0,
            remainingFee0: 0,
            remainingFee1: 0
            });
        
        _swap(tokensData, to, data);

        // 4. Deposit `amount0In` and `amount1In` to the respective vaults
        _depositToVault(tokenInIndex, amountIn);
    }


    /// @dev Get current epoch index value based on current timestamp.
    function currentEpoch() external view returns(uint256 epoch) {
        epoch = _calcEpochByTimestamp(block.timestamp);
    }

   /// @dev Get epoch index value based on a specified timestamp
   /// @param timestamp a given blockchain timestamp that is less than the current `block.timestamp`
    function epochByTimestamp(uint256 timestamp) external view returns(uint256 epoch) {
        epoch = _calcEpochByTimestamp(timestamp);
    }

   /// @dev Internal calculation for epoch index value based on a specified timestamp
   /// @param timestamp a given blockchain timestamp that is less than the current `block.timestamp`
    function _calcEpochByTimestamp(uint256 timestamp) internal view returns(uint256 epoch) {
        require(timestamp >= START_TIME, "Invalid timestamp");
        epoch = (timestamp - START_TIME) / EPOCH_INTERVAL;
    }
}