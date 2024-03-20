// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IPoolPairBase} from "./IPoolPairBase.sol";
import {StrategicPoolERC20Permit} from "./StrategicPoolERC20Permit.sol";
import {IStrategicPoolFactory} from "../interfaces/IStrategicPoolFactory.sol";
import {TokenHelper} from "./helpers/TokenHelper.sol";
import {Math} from "./libraries/math/Math.sol";


// Strategic Pool implementation
contract PoolPairBase is StrategicPoolERC20Permit, IPoolPairBase, ReentrancyGuard, TokenHelper {
  using Math for uint256;

  uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;
  bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

  uint112 private reserve0;           // uses single storage slot, accessible via getReserves
  uint112 private reserve1;           // uses single storage slot, accessible via getReserves
  uint16 public token0FeePercent = 300; // default = 0.3%  // uses single storage slot, accessible via getReserves
  uint16 public token1FeePercent = 300; // default = 0.3%  // uses single storage slot, accessible via getReserves

  uint256 public precisionMultiplier0;
  uint256 public precisionMultiplier1;

  uint256 public kLast; // reserve0 * reserve1, as of immediately after the most recent liquidity event

    address public factory;
    address public token0;
    address public token1;

    bool public initialized;
    bool public stableSwapMode;
    
    uint public constant FEE_DENOMINATOR = 100000;
    uint public constant MAX_FEE_PERCENT = 2000; // = 2%

    constructor(address factory_) StrategicPoolERC20Permit('STRATEGIC POOL', 'STRATEGIC POOL') {
      factory = factory_;
    }

  /// @dev Initialiser function called once by the factory at time of deployment to create initial state of the deployed pool
  /// @param _token0 address of token0
  /// @param _token1 address of token0
  /// @param _stableSwapMode boolean to denote if pool is in stableSwapMode
  function initialize(address _token0, address _token1, bool _stableSwapMode) external {
    require(msg.sender == factory && !initialized, 'forbidden');
    // sufficient check
    token0 = _token0;
    token1 = _token1;
    stableSwapMode = _stableSwapMode;

    precisionMultiplier0 = 10 ** uint256(IERC20Metadata(_token0).decimals());
    precisionMultiplier1 = 10 ** uint256(IERC20Metadata(_token1).decimals());

    initialized = true;
  }

  /// @dev Deposits liquidity of both tokens with the appropriate corresponding amounts and receives corresponding amount of LP token.
  /// @param to address of receiver of LP token minted from depositing liquidity
  function _deposit(address to, uint256 balance0, uint256 balance1) internal nonReentrant returns(uint256 liquidity) {
    (uint112 _reserve0, uint112 _reserve1,,) = getReserves();
    // (uint256 balance0, uint256 balance1) = _selfUnderlyingTokenBalances();
    uint256 amount0 = balance0;
    uint256 amount1 = balance1;

    bool feeOn = _mintFee(_reserve0, _reserve1);
    uint256 _totalSupply = totalSupply();
    
    if(_totalSupply == 0) {
      // amount0 * amount1 - 1000 -> Seeding of liquidity will lead to a small loss
      liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY; // Pure Liquidity with addtional MINIMUM LIQUIDITY TOKEN locked away (to prevent execution revertion should it be drained by preventing it from being drained 100%)
      _mint(factory, MINIMUM_LIQUIDITY); // Permanently lock Min. liquidity i.e. 1000 -> Into FACTORY temporarily
    } else {
      uint256 ratio0 = (amount0 * _totalSupply) / reserve0;
      uint256 ratio1 = (amount1 * _totalSupply) / reserve1;
      liquidity = Math.min(ratio0, ratio1);
    }

    require(liquidity > 0, "Insufficient liquidity minted");
    _mint(to, liquidity);
    _update(balance0 + reserve0, balance1 + reserve1); // Update with new balance + reserves since balance will be then deposited

    if (feeOn) kLast = _k(uint256(reserve0), uint256(reserve1));

    emit DepositLiquidity(msg.sender, amount0, amount1, liquidity);
  }


  /// @dev Withdraws liquidity of both tokens based on burning the respective LP token.
  /// @param to address of receiver from removing liquidity
  /// @param liquidity  amount of LP token that represents liquidity stake of pool
  function _withdraw(address to,uint256 liquidity) internal nonReentrant returns(uint256 amount0, uint256 amount1) {

    address _token0 = token0; // gas savings
    address _token1 = token1; // gas savings
    // (uint256 balance0, uint256 balance1) = _selfUnderlyingTokenBalances(); // Withdrawn tokens to the AMM pool so check balance

    // uint256 liquidity = _selfBalance(address(this)); //@To-Do Double check liquidity here -> Assumes that its transferred into the pool contract first
    require(_selfBalance(address(this)) >= liquidity, "Invalid liquidity possessed.");

    (uint112 _reserve0, uint112 _reserve1,,) = getReserves();
    bool feeOn = _mintFee(_reserve0, _reserve1);
    // uint256 _totalSupply = totalSupply();
    // amount0 = liquidity * uint256(_reserve0) / _totalSupply; // use _reserve0 as its not updated yet and represents entire stake less pending non-harvested rewards
    // amount1 = liquidity * uint256(_reserve1) / _totalSupply; // same as _reserv1
    (amount0, amount1) = previewWithdrawLiquidityAmounts(liquidity);
    require(amount0 > 0 && amount1 > 0, "Insufficient liquidity burnt");

    _burn(address(this), liquidity);

    // Safe Transfer via TokenHelper library
    _transferOut(_token0, to, amount0);
    _transferOut(_token1, to, amount1);

    // (balance0, balance1) = _selfUnderlyingTokenBalances();
    // _update(balance0, balance1);
    _update(uint256(_reserve0) - amount0, uint256(_reserve1) - amount1);
    // If fee involved, need to update k since reserves are changing -> new k
    if (feeOn) kLast = _k(uint256(reserve0), uint256(reserve1));
  
    emit RemoveLiquidity(msg.sender, to, amount0, amount1, liquidity);
  }

  /// @dev Calculates respective amounts of tokenOuts when withdrawing liquidity via trading in (burning) of LP token.
  /// @param liquidity  amount of LP token that represents liquidity stake of pool
  function previewWithdrawLiquidityAmounts(uint256 liquidity) public view returns(uint256 amount0, uint256 amount1) {
    // require(balanceOf(msg.sender) >= liquidity, "Insufficient liquidity owned.");
    (uint112 _reserve0, uint112 _reserve1,,) = getReserves();
    uint256 _totalSupply = totalSupply();
    amount0 = liquidity * uint256(_reserve0) / _totalSupply;
    amount1 = liquidity * uint256(_reserve1) / _totalSupply;
  }

  /// @dev Retrieves data of reserves and the fee basis points of each token. To be overriden by custom pool implementation.
  /// @param amountIn amount of tokenIn to swap 
  /// @param tokenIn address of tokenIn
  /// @param to address of receiver from swap
  /// @param data bytes of instructions
  function swap(uint256 amountIn,address tokenIn, address to, bytes calldata data) external virtual {
      require(amountIn == 0, "Invalid token swap");
      require(tokenIn == token0 || tokenIn == token1, "Invalid tokenIn");
        // 1. Transfer `tokenIn` amount to the pool contract
      _transferIn(tokenIn, msg.sender, amountIn);

      uint256 amountOut = previewAmountOut(tokenIn, amountIn); // Formula of AMM calculated here
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
  }

    /// @dev Retrieves data of reserves and the fee basis points of each token
    /// @param to address of receiver for excess tokens
  function skim(address to) external virtual nonReentrant {
    address _token0 = token0;
    uint256 additionalToken0 = _selfBalance(_token0) - reserve0;
    // gas savings
    address _token1 = token1;
    uint256 additionalToken1 = _selfBalance(_token1) - reserve1;
    // gas savings
    _transferOut(_token0, to, additionalToken0);
    _transferOut(_token1, to, additionalToken1);

    emit Skim();
  }

  /// @dev Syncs and updates the correct reserves based on token balances. Can be overriden for custom pool implementation.
  function sync() external virtual {
    uint256 token0Balance = IERC20(token0).balanceOf(address(this));
    uint256 token1Balance = IERC20(token1).balanceOf(address(this));
    require(token0Balance != 0 && token1Balance != 0, "Liquidity ratio not yet initialised");
    _update(token0Balance, token1Balance);
  }

    /// @dev Retrieves data of reserves and the fee basis points of each token
    /// @param _reserve0 the current reserves of token0
    /// @param _reserve1 the current reserves of token1
    /// @param _token0FeePercent the fee basis points of token0
    /// @param _token1FeePercent the fee basis points of token1
    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint16 _token0FeePercent, uint16 _token1FeePercent) {
    _reserve0 = reserve0;
    _reserve1 = reserve1;
    _token0FeePercent = token0FeePercent;
    _token1FeePercent = token1FeePercent;
  }

  /// @dev Calculates previewed amount to received of the corresponding for trading in the specified token
  /// @param tokenIn address of the token to trade in
  /// @param amountIn the amount to trade of the specified token
  function previewAmountOut(address tokenIn, uint256 amountIn) public view returns(uint256 amountOut) {
    uint16 feePercent = tokenIn == token0 ? token0FeePercent : token1FeePercent;
    amountOut = _getAmountOut(tokenIn, amountIn, uint256(reserve0), uint256(reserve1), feePercent);
  }

  /// @dev Swaps a specified token for the other with the appropriate corresponding amount based on the respective bonding curve formula.
  /// @param tokensData Struct containing all the metadata of the trade.
  /// @param to address to send the swapped tokens
  function _swap(TokensData memory tokensData, address to, bytes memory) internal nonReentrant { 
    require(tokensData.amount0Out > 0 || tokensData.amount1Out > 0, ' Insufficient output amount');

    (uint112 _reserve0, uint112 _reserve1, uint16 _token0FeePercent, uint16 _token1FeePercent) = getReserves();
    require(tokensData.amount0Out < _reserve0 && tokensData.amount1Out < _reserve1, ' Insufficient liquidity');
    {
      require(to != tokensData.token0 && to != tokensData.token1, 'Invalid receiver address');
      // optimistically transfer tokens IN and OUT
      tokensData.amount0Out > 0 ? _transferOut(tokensData.token0, to, tokensData.amount0Out) : _transferIn(tokensData.token0, msg.sender, tokensData.amount0In);
      // optimistically transfer tokens IN and OUT
      tokensData.amount1Out > 0 ? _transferOut(tokensData.token1, to, tokensData.amount1Out) : _transferIn(tokensData.token1, msg.sender, tokensData.amount1In);
      // if (data.length > 0) IUniswapV2Callee(to).uniswapV2Call(msg.sender, tokensData.amount0Out, tokensData.amount1Out, data);

      // Update Balances
      tokensData.balance0 = uint256(_reserve0) - tokensData.amount0Out + tokensData.amount0In; 
      tokensData.balance1 = uint256(_reserve1) - tokensData.amount1Out + tokensData.amount1In;
    }
    
    require(tokensData.amount0In > 0 || tokensData.amount1In > 0, ' Insufficient input amount'); // Note: The transfer in occurs outside of this function.

    // Calculate Remaining Fee of the tokenIn
    tokensData.remainingFee0 = (tokensData.amount0In *_token0FeePercent) / FEE_DENOMINATOR; 
    tokensData.remainingFee1 = (tokensData.amount1In *_token1FeePercent) / FEE_DENOMINATOR;

    // {// scope for referer/stable fees management
      // readjust tokens balance
      // if (amount0In > 0) tokensData.balance0 = IERC20(tokensData.token0).balanceOf(address(this));
      // if (amount1In > 0) tokensData.balance1 = IERC20(tokensData.token1).balanceOf(address(this));
      // if (amount0In > 0) tokensData.balance0 += amount0In;
      // if (amount1In > 0) tokensData.balance1 += amount1In;
    // }
    {// scope for reserve{0,1}Adjusted, avoids stack too deep errors
      uint256 balance0Adjusted = tokensData.balance0 - tokensData.remainingFee0; // Redundant if remainingFee0 == 0
      uint256 balance1Adjusted = tokensData.balance1 - tokensData.remainingFee1; // Redundant if remainingFee1 == 0
      require(_k(balance0Adjusted, balance1Adjusted) >= _k(uint256(_reserve0), uint256(_reserve1)), 'K should be equal or increased');
    }
    _update(tokensData.balance0, tokensData.balance1);
    emit Swap(msg.sender, tokensData.amount0In, tokensData.amount1In, tokensData.amount0Out, tokensData.amount1Out, to);
  }

    // if fee is on, mint liquidity equivalent to "factory.ownerFeeShare()" of the growth in sqrt(k)
  // only for uni configuration
  /// @dev Calculates the preview amountOut of the corresponding token from a specific trade-in amount of a supported token.
  /// @param _reserve0 the current reserves of token0
  /// @param _reserve1 the current reserves of token1
  function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
    if(stableSwapMode) return false;

    (uint ownerFeeShare, address feeTo) = IStrategicPoolFactory(factory).feeInfo();
    feeOn = feeTo != address(0); // Checks if fee is present
    uint _kLast = kLast; // gas savings

    if (feeOn) {
      if (_kLast != 0) {
        uint rootK = Math.sqrt(_k(uint256(_reserve0), uint256(_reserve1)));
        uint rootKLast = Math.sqrt(_kLast);

        // Check if the current pool liquidity has increased
        if (rootK > rootKLast) {
          uint d = (FEE_DENOMINATOR * 100 / ownerFeeShare) - 100; // fee multiplier d, which is a factor by which the fees collected should be adjusted based on the FEE_DENOMINATOR and the owner's fee share. 
          uint numerator = totalSupply() * (rootK - rootKLast) * 100; // Incremental k from `rootK` - `rootKLast`
          uint denominator = rootK * d + (rootKLast * 100);
          uint liquidity = numerator / denominator;
          if (liquidity > 0) _mint(feeTo, liquidity);
        }
      }
    } else if (_kLast != 0) {
      kLast = 0;
    }
  }

  /// @dev Calculates the preview amountOut of the corresponding token from a specific trade-in amount of a supported token.
  /// @param tokenIn the balance of desired token
  /// @param amountIn the amount of desired token
  /// @param _reserve0 the current reserves of token0
  /// @param _reserve1 the current reserves of token1
  /// @param feeBps the percentage basis points of fee
  function _getAmountOut(address tokenIn, uint256 amountIn, uint256 _reserve0, uint256 _reserve1, uint256 feeBps) internal view returns (uint256 amountOut) {
    (uint reserveA, uint reserveB) = tokenIn == token0 ? (_reserve0, _reserve1) : (_reserve1, _reserve0);

    if (stableSwapMode) {
      amountIn = amountIn - (amountIn * feeBps / FEE_DENOMINATOR); // Remove fee from amount received
      uint256 xy = _k(reserveA, reserveB);
      _reserve0 = _reserve0 * Math.ONE / precisionMultiplier0;
      _reserve1 = _reserve1 * Math.ONE / precisionMultiplier1;

      uint256 precisionMultiplier = tokenIn == token0 ? precisionMultiplier0 : precisionMultiplier1;

      amountIn = amountIn * Math.ONE / precisionMultiplier;
      uint256 y = reserveB - Math._get_y(amountIn + reserveA, xy, reserveB);

      amountOut = y * precisionMultiplier / Math.ONE;
    } else {
      amountIn = amountIn * (FEE_DENOMINATOR - feeBps);
      amountOut = (amountIn * reserveB) / ((reserveA * FEE_DENOMINATOR) + amountIn); // Constant product
    }
  }

  /// @dev Retrieves the underlying token balances of each token. Able to override for custom pool implementation with strategies on reserves.
  function _selfUnderlyingTokenBalances() internal virtual view returns(uint256 balance0, uint256 balance1) {
    balance0 = _selfBalance(token0);
    balance1 = _selfBalance(token1);
  }


    /// @dev Calculates k from either the constant product formula or StableSwap formula
    /// @param balance0 the balance of token0
    /// @param balance1 the balance of token1
  function _k(uint256 balance0, uint256 balance1) internal view returns(uint256 k) {
    if (stableSwapMode) {
      uint256 _x = Math.divDown(balance0, precisionMultiplier0);
      uint256 _y = Math.divDown(balance1, precisionMultiplier1);

      uint256 _a = Math.mulDown(_x, _y);
      uint256 _x2 = Math.mulDown(_x, _x);
      uint256 _y2 = Math.mulDown(_y, _y);

      uint256 _b = _x2 + _y2;
      k = Math.mulDown(_a, _b); // x3y+y3x >= k
    } else {
      k = balance0 * balance1; // Constant product x*y=k
    }
  }



    /// @dev Updates the respective token reserve balances.
    /// @param balance0 the balance of token0
    /// @param balance1 the balance of token1
  function _update(uint256 balance0, uint256 balance1) private {
      require(balance0 <= type(uint112).max, 'Overflow balance0');
      require(balance1 <= type(uint112).max, 'Overflow balance1');

      reserve0 = uint112(balance0);
      reserve1 = uint112(balance1);
      emit Sync( uint112(balance0),  uint112(balance1));
  }
}