// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/IAlgebraRouter.sol";

/**
 * @title AlgebraSwapper
 * @notice Swapper for Algebra-based DEXs (Camelot V3, QuickSwap V3)
 * @dev Algebra uses dynamic fees instead of fee tiers
 */
contract AlgebraSwapper is IDexSwapper {
    using SafeERC20 for IERC20;

    struct SwapData {
        address router;
        uint160 limitSqrtPrice;
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

        // Approve router
        IERC20(tokenIn).forceApprove(swapData.router, amountIn);

        // Execute swap
        IAlgebraRouter.ExactInputSingleParams memory params = IAlgebraRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0, // No min output - handled by caller
                limitSqrtPrice: swapData.limitSqrtPrice
            });

        amountOut = IAlgebraRouter(swapData.router).exactInputSingle(params);
    }

    function dexType() external pure override returns (string memory) {
        return "algebra";
    }
}
