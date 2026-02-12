// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/ISolidlyRouter.sol";

/**
 * @title SolidlySwapper
 * @notice Swapper for Solidly-style DEXs (Velodrome, Aerodrome)
 * @dev Supports both stable and volatile pools
 */
contract SolidlySwapper is IDexSwapper {
    using SafeERC20 for IERC20;

    struct SwapData {
        address router;
        bool stable;
        address factory;
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

        // Build route
        ISolidlyRouter.Route[] memory routes = new ISolidlyRouter.Route[](1);
        routes[0] = ISolidlyRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: swapData.stable,
            factory: swapData.factory
        });

        // Execute swap
        uint256[] memory amounts = ISolidlyRouter(swapData.router)
            .swapExactTokensForTokens(
                amountIn,
                0, // No min output - handled by caller
                routes,
                msg.sender,
                block.timestamp
            );

        amountOut = amounts[amounts.length - 1];
    }

    function dexType() external pure override returns (string memory) {
        return "solidly";
    }
}
