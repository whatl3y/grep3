// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/ISwapRouter.sol";

/**
 * @title UniswapV3Swapper
 * @notice Swapper for Uniswap V3 pools
 * @dev Supports exact input single swaps with fee tier specification
 */
contract UniswapV3Swapper is IDexSwapper {
    using SafeERC20 for IERC20;

    struct SwapData {
        address router;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
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
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: swapData.fee,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0, // No min output - handled by caller
                sqrtPriceLimitX96: swapData.sqrtPriceLimitX96
            });

        amountOut = ISwapRouter(swapData.router).exactInputSingle(params);
    }

    function dexType() external pure override returns (string memory) {
        return "uniswap_v3";
    }
}
