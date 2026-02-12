// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDexSwapper.sol";
import "../interfaces/IBalancerVault.sol";

/**
 * @title BalancerSwapper
 * @notice Swapper for Balancer V2 pools
 */
contract BalancerSwapper is IDexSwapper {
    using SafeERC20 for IERC20;

    struct SwapData {
        address vault;
        bytes32 poolId;
        bytes userData;
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

        // Approve vault
        IERC20(tokenIn).forceApprove(swapData.vault, amountIn);

        // Build swap params
        IBalancerVault.SingleSwap memory singleSwap = IBalancerVault.SingleSwap({
            poolId: swapData.poolId,
            kind: IBalancerVault.SwapKind.GIVEN_IN,
            assetIn: tokenIn,
            assetOut: tokenOut,
            amount: amountIn,
            userData: swapData.userData
        });

        IBalancerVault.FundManagement memory funds = IBalancerVault.FundManagement({
            sender: address(this),
            fromInternalBalance: false,
            recipient: payable(msg.sender),
            toInternalBalance: false
        });

        // Execute swap
        amountOut = IBalancerVault(swapData.vault).swap(
            singleSwap,
            funds,
            0, // No min output - handled by caller
            block.timestamp
        );
    }

    function dexType() external pure override returns (string memory) {
        return "balancer";
    }
}
