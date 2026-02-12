// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAlgebraRouter
 * @notice Interface for Algebra-based DEX routers (Camelot V3, QuickSwap V3)
 */
interface IAlgebraRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 limitSqrtPrice;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);

    function exactInput(
        ExactInputParams calldata params
    ) external payable returns (uint256 amountOut);

    function exactInputSingleSupportingFeeOnTransferTokens(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut);
}
