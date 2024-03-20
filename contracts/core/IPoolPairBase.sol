// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPoolPairBase {

  struct TokensData {
    address token0;
    address token1;
    uint amount0In;
    uint amount1In;
    uint amount0Out;
    uint amount1Out;
    uint balance0;
    uint balance1;
    uint remainingFee0;
    uint remainingFee1;
    }

    event DepositLiquidity(address indexed provider, uint256 token0Amount, uint256 token1Amount, uint256 lpTokenAmount);
    event RemoveLiquidity(address indexed provider, address indexed to, uint256 token0Amount, uint256 token1Amount, uint256 lpTokenAmount);
    event Swap(
    address indexed sender,
    uint256 amount0In,
    uint256 amount1In,
    uint256 amount0Out,
    uint256 amount1Out,
    address indexed to
  );
    event Sync(uint112 reserve0, uint112 reserve1);
    event Skim();

    function initialize(address _token0, address _token1, bool _stableSwapMode) external;

    function skim(address to) external;
    function sync() external;

    function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint16 _token0FeePercent, uint16 _token1FeePercent);
}