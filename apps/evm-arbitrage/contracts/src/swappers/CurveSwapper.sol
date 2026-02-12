// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/ICurvePool.sol";

/**
 * @title CurveSwapper
 * @notice Swapper for Curve pools (StableSwap and CryptoSwap)
 */
contract CurveSwapper is IDexSwapper {
    using SafeERC20 for IERC20;

    enum PoolType {
        STABLESWAP,     // int128 indices
        CRYPTOSWAP,     // uint256 indices
        META            // underlying exchange
    }

    struct SwapData {
        address pool;
        PoolType poolType;
        int128 i;       // Input token index (for StableSwap/Meta)
        int128 j;       // Output token index (for StableSwap/Meta)
        uint256 iCrypto; // Input token index (for CryptoSwap)
        uint256 jCrypto; // Output token index (for CryptoSwap)
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        SwapData memory swapData = abi.decode(data, (SwapData));

        // Transfer tokens to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve pool
        IERC20(tokenIn).forceApprove(swapData.pool, amountIn);

        // Get balance before
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // Execute swap based on pool type
        if (swapData.poolType == PoolType.STABLESWAP) {
            ICurvePool(swapData.pool).exchange(
                swapData.i,
                swapData.j,
                amountIn,
                0 // No min output - handled by caller
            );
        } else if (swapData.poolType == PoolType.CRYPTOSWAP) {
            ICurvePool(swapData.pool).exchange(
                swapData.iCrypto,
                swapData.jCrypto,
                amountIn,
                0
            );
        } else {
            // Meta pool - underlying exchange
            ICurvePool(swapData.pool).exchange_underlying(
                swapData.i,
                swapData.j,
                amountIn,
                0
            );
        }

        // Calculate output from balance change
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balanceBefore;

        // Transfer output to sender
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }

    function dexType() external pure override returns (string memory) {
        return "curve";
    }
}
