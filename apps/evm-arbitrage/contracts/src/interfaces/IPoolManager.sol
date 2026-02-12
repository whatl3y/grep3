// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPoolManager
 * @notice Interface for Uniswap V4 PoolManager
 */
interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    function swap(
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external returns (int256 amount0, int256 amount1);

    function unlock(bytes calldata data) external returns (bytes memory);
}

/**
 * @title IPoolManagerCallback
 * @notice Callback interface for Uniswap V4 swap operations
 */
interface IPoolManagerCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}
