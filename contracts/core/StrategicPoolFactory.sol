// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IStrategicPoolFactory} from "../interfaces/IStrategicPoolFactory.sol";
import {IStrategicPoolPair} from "./IStrategicPoolPair.sol";
import {BoringOwnable} from "./helpers/BoringOwnable.sol";
import {StrategicPoolPairERC4626} from "./StrategicPoolPairERC4626.sol";

contract StrategicPoolFactory is IStrategicPoolFactory, BoringOwnable {
    address public FEE_RECEIVER;

    uint256 public constant OWNER_FEE_MAX = 10000; // 100%
    uint256 public feeShare = 5000; // 50%

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    constructor(address feeReceiver_) {
        FEE_RECEIVER = feeReceiver_;
    }

    /// @dev Manufacture a AMM pool contract based on the input tokens and respective ERC-4626 Vaults 
    /// @param tokenA address of first supported token
    /// @param tokenB address of second supported token
    /// @param tokenAVault address of first supported token ERC-4626 Vault Strategy contract
    /// @param tokenBVault address of second supported token ERC-4626 Vault Strategy contract
    function createPair(address tokenA, address tokenB, address tokenAVault, address tokenBVault, bool stableSwapMode) external returns (address pair) {
        require(tokenA != tokenB, 'Identical token addresses');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        (address token0Vault, address token1Vault) = tokenA < tokenB ? (tokenAVault, tokenBVault) : (tokenBVault, tokenAVault);
        require(token0 != address(0), 'Null address');
        require(getPair[token0][token1] == address(0), 'Pair already exists'); // single check is sufficient

        bytes memory bytecode = _getPairCreationCode(token0Vault, token1Vault);
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), "Failed pair deployment");

        IStrategicPoolPair(pair).initialize(token0, token1, stableSwapMode);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, token0Vault, token1Vault, stableSwapMode, pair, allPairs.length);
    }

    /// @dev Internal function to retrieve compiled bytecode of the AMM pool contract based on the input tokens.
    /// @param _tokenAVault address of first supported token ERC-4626 Vault Strategy contract
    /// @param _tokenBVault address of second supported token ERC-4626 Vault Strategy contract
    function _getPairCreationCode(address _tokenAVault, address _tokenBVault) internal pure returns (bytes memory) {
        bytes memory bytecode = type(StrategicPoolPairERC4626).creationCode;
        return abi.encodePacked(bytecode, abi.encode(_tokenAVault, _tokenBVault));
    }

    /// @dev Get the total count of deployed AMM pool contracts from the factory.
    function allPairsLength() external view returns(uint256 length) {
        length = allPairs.length;
    }

    /// @dev Configure fee receipient address from swap fees from all deployed AMM pools collected for the treasury. Only to be called by admin
    /// @param receiver address of receiving wallet
    function setFeeReceiver(address receiver) external onlyOwner {
        FEE_RECEIVER = receiver;
    }
    
    /// @dev Configure fee basis points share for each swap on deployed AMM pools. Only to be called by admin
    /// @param share basis points with a max. denomination of 10_000 for fee percentage cut.
    function setReceiverFeeShare(uint256 share) external onlyOwner {
        feeShare = share;
    }

    /// @dev Get current fee basis points.
    function ownerFeeShare() external view returns (uint256 share) {
        share = feeShare;
    }

    /// @dev Get fee basis points and the receiver address.
    function feeInfo() external view returns(uint256 receiverFeeShare, address receiver) {
        receiverFeeShare = feeShare;
        receiver = FEE_RECEIVER;
    }
}