// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract SimpleAMM is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    uint256 public reserveA;
    uint256 public reserveB;

    error ZeroAddress();
    error IdenticalTokens();
    error ZeroAmount();
    error PoolEmpty();
    error InvalidToken();
    error InvalidRatio();
    error InsufficientReserves();
    error InsufficientOutputAmount();
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);

    event Deposited(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity);
    event Redeemed(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity);
    event Swapped(address indexed trader, address indexed tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address _tokenA, address _tokenB) ERC20("Simple AMM Liquidity Token", "SAMM-LP") {
        if (_tokenA == address(0)) revert ZeroAddress();
        if (_tokenB == address(0)) revert ZeroAddress();
        if (_tokenA == _tokenB) revert IdenticalTokens();

        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function deposit(uint256 amountA, uint256 amountB) external returns (uint256 liquidity) {
        if (amountA == 0) revert ZeroAmount();
        if (amountB == 0) revert ZeroAmount();

        uint256 totalLiquidity = totalSupply();
        if (totalLiquidity == 0) {
            liquidity = Math.sqrt(amountA * amountB);
        } else {
            if (amountA * reserveB != amountB * reserveA) revert InvalidRatio();
            liquidity = (amountA * totalLiquidity) / reserveA;
        }

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        reserveA += amountA;
        reserveB += amountB;
        _mint(msg.sender, liquidity);

        emit Deposited(msg.sender, amountA, amountB, liquidity);
    }

    function redeem(uint256 amountA, uint256 amountB) external returns (uint256 liquidity) {
        if (amountA == 0) revert ZeroAmount();
        if (amountB == 0) revert ZeroAmount();

        uint256 totalLiquidity = totalSupply();
        if (totalLiquidity == 0) revert PoolEmpty();
        if (amountA > reserveA) revert InsufficientReserves();
        if (amountB > reserveB) revert InsufficientReserves();
        if (amountA * reserveB != amountB * reserveA) revert InvalidRatio();

        liquidity = (amountA * totalLiquidity) / reserveA;
        _burn(msg.sender, liquidity);

        reserveA -= amountA;
        reserveB -= amountB;

        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);

        emit Redeemed(msg.sender, amountA, amountB, liquidity);
    }

    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (totalSupply() == 0) revert PoolEmpty();

        if (tokenIn == address(tokenA)) {
            amountOut = _swap(tokenA, tokenB, amountIn, minAmountOut, reserveA, reserveB);
            reserveA += amountIn;
            reserveB -= amountOut;
        } else if (tokenIn == address(tokenB)) {
            amountOut = _swap(tokenB, tokenA, amountIn, minAmountOut, reserveB, reserveA);
            reserveB += amountIn;
            reserveA -= amountOut;
        } else {
            revert InvalidToken();
        }

        emit Swapped(msg.sender, tokenIn, amountIn, amountOut);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    function _swap(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) private returns (uint256 amountOut) {
        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut == 0) revert InsufficientOutputAmount();
        if (amountOut < minAmountOut) revert SlippageExceeded(amountOut, minAmountOut);

        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenOut.safeTransfer(msg.sender, amountOut);
    }
}
