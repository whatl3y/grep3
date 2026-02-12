// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/IUniswapV2Router02.sol";

/**
 * @title UniswapV2Swapper
 * @notice Swapper for Uniswap V2 and compatible forks
 * @dev Supports: Uniswap V2, SushiSwap, PancakeSwap V2, ShibaSwap, BabyDogeSwap
 */
contract UniswapV2Swapper is IDexSwapper {
    using SafeERC20 for IERC20;

    struct SwapData {
        address router;
        address[] path;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        SwapData memory swapData = abi.decode(data, (SwapData));

        // Build path if not provided
        address[] memory path;
        if (swapData.path.length == 0) {
            path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
        } else {
            path = swapData.path;
        }

        // Transfer tokens to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router
        IERC20(tokenIn).forceApprove(swapData.router, amountIn);

        // Execute swap
        uint256[] memory amounts = IUniswapV2Router02(swapData.router)
            .swapExactTokensForTokens(
                amountIn,
                0, // No min output - handled by caller
                path,
                msg.sender,
                block.timestamp
            );

        amountOut = amounts[amounts.length - 1];
    }

    function dexType() external pure override returns (string memory) {
        return "uniswap_v2";
    }
}
