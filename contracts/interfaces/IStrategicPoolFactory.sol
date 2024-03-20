// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IStrategicPoolFactory {
    event PairCreated(address indexed token0, address indexed token1,address vault0, address vault1, bool stableSwap, address pair, uint256 totalPairs);

    function ownerFeeShare() external view returns (uint256);

    function getPair(address token0, address token1) external view returns (address pair);
    function allPairs(uint256) external view returns (address);
    function allPairsLength() external view returns (uint256);

    function createPair(address tokenA, address tokenB, address tokenAVault, address tokenBVault, bool stableSwapMode) external returns (address pair);

    function setReceiverFeeShare(uint256 share) external;
    function feeInfo() external view returns (uint256, address);
}