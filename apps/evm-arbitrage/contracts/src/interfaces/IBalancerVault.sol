// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IFlashLoanRecipient
 * @notice Interface that must be implemented by contracts receiving Balancer flash loans
 */
interface IFlashLoanRecipient {
    /**
     * @notice Called by the Vault when a flash loan is executed
     * @param tokens The tokens being flash loaned
     * @param amounts The amounts being flash loaned
     * @param feeAmounts The fee amounts for each token
     * @param userData The userData passed to the Vault
     */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

/**
 * @title IBalancerVault
 * @notice Interface for Balancer V2 Vault
 */
interface IBalancerVault {
    enum SwapKind {
        GIVEN_IN,
        GIVEN_OUT
    }

    struct SingleSwap {
        bytes32 poolId;
        SwapKind kind;
        address assetIn;
        address assetOut;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }

    struct BatchSwapStep {
        bytes32 poolId;
        uint256 assetInIndex;
        uint256 assetOutIndex;
        uint256 amount;
        bytes userData;
    }

    function swap(
        SingleSwap memory singleSwap,
        FundManagement memory funds,
        uint256 limit,
        uint256 deadline
    ) external payable returns (uint256);

    function batchSwap(
        SwapKind kind,
        BatchSwapStep[] memory swaps,
        address[] memory assets,
        FundManagement memory funds,
        int256[] memory limits,
        uint256 deadline
    ) external payable returns (int256[] memory);

    function getPoolTokens(
        bytes32 poolId
    ) external view returns (
        address[] memory tokens,
        uint256[] memory balances,
        uint256 lastChangeBlock
    );

    /**
     * @notice Performs a flash loan
     * @param recipient The contract receiving the flash loan
     * @param tokens The tokens to flash loan
     * @param amounts The amounts to flash loan
     * @param userData Arbitrary data passed to the recipient
     */
    function flashLoan(
        IFlashLoanRecipient recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}
