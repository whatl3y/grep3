// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/IPoolManager.sol";

/**
 * @title UniswapV4Swapper
 * @notice Swapper for Uniswap V4 pools
 * @dev Uses the PoolManager singleton pattern with unlock callbacks
 */
contract UniswapV4Swapper is IDexSwapper, IPoolManagerCallback {
    using SafeERC20 for IERC20;

    struct SwapData {
        address poolManager;
        IPoolManager.PoolKey poolKey;
        bool zeroForOne;
        uint160 sqrtPriceLimitX96;
    }

    // Transient storage for callback
    address private _sender;
    address private _tokenIn;
    address private _tokenOut;
    uint256 private _amountIn;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        SwapData memory swapData = abi.decode(data, (SwapData));

        // Store callback data
        _sender = msg.sender;
        _tokenIn = tokenIn;
        _tokenOut = tokenOut;
        _amountIn = amountIn;

        // Transfer tokens to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Unlock and execute swap
        bytes memory result = IPoolManager(swapData.poolManager).unlock(
            abi.encode(swapData)
        );

        amountOut = abi.decode(result, (uint256));

        // Clear transient storage
        _sender = address(0);
        _tokenIn = address(0);
        _tokenOut = address(0);
        _amountIn = 0;
    }

    function unlockCallback(
        bytes calldata data
    ) external override returns (bytes memory) {
        SwapData memory swapData = abi.decode(data, (SwapData));

        // Approve PoolManager
        IERC20(_tokenIn).forceApprove(swapData.poolManager, _amountIn);

        // Execute swap
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: swapData.zeroForOne,
            amountSpecified: int256(_amountIn),
            sqrtPriceLimitX96: swapData.sqrtPriceLimitX96
        });

        (int256 amount0, int256 amount1) = IPoolManager(swapData.poolManager)
            .swap(swapData.poolKey, params, "");

        // Calculate output amount
        uint256 amountOut;
        if (swapData.zeroForOne) {
            amountOut = amount1 > 0 ? uint256(amount1) : uint256(-amount1);
        } else {
            amountOut = amount0 > 0 ? uint256(amount0) : uint256(-amount0);
        }

        // Transfer output to original sender
        IERC20(_tokenOut).safeTransfer(_sender, amountOut);

        return abi.encode(amountOut);
    }

    function dexType() external pure override returns (string memory) {
        return "uniswap_v4";
    }
}
