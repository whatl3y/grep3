// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDexSwapper
 * @notice Base interface for all DEX swapper implementations
 * @dev Each swapper implementation handles a specific DEX or DEX family
 */
interface IDexSwapper {
    /**
     * @notice Execute a token swap
     * @param tokenIn The input token address
     * @param tokenOut The output token address
     * @param amountIn The amount of input tokens to swap
     * @param data DEX-specific encoded parameters (router address, pool info, etc.)
     * @return amountOut The amount of output tokens received
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external returns (uint256 amountOut);

    /**
     * @notice Get the DEX type identifier
     * @return The DEX type as a string (e.g., "uniswap_v2", "uniswap_v3", "curve")
     */
    function dexType() external pure returns (string memory);
}
