// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMorpho
 * @notice Interface for Morpho flash loans
 * @dev Morpho uses a simple flash loan interface with no fees
 */
interface IMorpho {
    /**
     * @notice Executes a flash loan
     * @param token The token to flash loan
     * @param assets The amount to flash loan
     * @param data Arbitrary data passed to the callback
     */
    function flashLoan(
        address token,
        uint256 assets,
        bytes calldata data
    ) external;
}

/**
 * @title IMorphoFlashLoanCallback
 * @notice Interface that must be implemented by contracts receiving Morpho flash loans
 */
interface IMorphoFlashLoanCallback {
    /**
     * @notice Called by Morpho during a flash loan
     * @param assets The amount that was flash loaned
     * @param data The data passed to flashLoan
     */
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}
