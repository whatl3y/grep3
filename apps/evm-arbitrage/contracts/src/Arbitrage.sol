// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDexSwapper.sol";
import "./interfaces/IBalancerVault.sol";
import "./interfaces/IMorpho.sol";

/// @notice Interface for WETH
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Arbitrage
 * @notice Flash loan-powered arbitrage contract that executes multi-hop swaps across DEXs
 * @dev Uses Balancer or Morpho flash loans, converts profit to ETH, and sends to caller
 */
contract Arbitrage is Ownable, ReentrancyGuard, IFlashLoanRecipient, IMorphoFlashLoanCallback {
    using SafeERC20 for IERC20;

    /// @notice Flash loan provider types
    enum FlashLoanProvider {
        BALANCER,
        MORPHO
    }

    /// @notice Swap configuration for each hop in the arbitrage path
    struct SwapConfig {
        IDexSwapper swapper;
        address tokenIn;
        address tokenOut;
        uint256 amountIn; // Only used for first swap
        bytes data;
    }

    /// @notice Parameters for executing an arbitrage
    struct ArbParams {
        SwapConfig[] swaps;
        uint16 bribeBps; // 0-10000 (basis points, 10000 = 100%)
    }

    /// @notice Mapping of approved swapper contracts
    mapping(address => bool) public approvedSwappers;

    /// @notice Emergency stop flag
    bool public emergencyStopped;

    /// @notice WETH address
    address public immutable weth;

    /// @notice Balancer Vault address for flash loans
    address public balancerVault;

    /// @notice Morpho address for flash loans
    address public morpho;

    /// @notice Temporarily stores the caller during flash loan execution
    address private _flashLoanCaller;

    /// @notice Temporarily stores gas tracking during flash loan
    uint256 private _initGas;

    /// @notice Emitted when a swapper is approved or revoked
    event SwapperApprovalSet(address indexed swapper, bool approved);

    /// @notice Emitted when emergency stop is toggled
    event EmergencyStopSet(bool stopped);

    /// @notice Emitted when an arbitrage is executed
    event ArbitrageExecuted(
        address indexed executor,
        address indexed inputToken,
        uint256 inputAmount,
        uint256 ethProfit,
        uint256 bribeAmount,
        uint256 gasCost
    );

    /// @notice Emitted when a bribe is paid to block producer
    event BribePaid(address indexed coinbase, uint256 amount);

    /// @notice Emitted when flash loan provider addresses are set
    event FlashLoanProvidersSet(address balancerVault, address morpho);

    error NotProfitable(uint256 ethReceived, uint256 totalCost);
    error InvalidBribeBps();
    error EmergencyStopped();
    error SwapperNotApproved(address swapper);
    error InvalidSwapConfig();
    error ZeroAddress();
    error InvalidFlashLoanCaller();
    error FlashLoanProviderNotSet();
    error UnauthorizedFlashLoanCallback();

    constructor(address _weth) Ownable(msg.sender) {
        if (_weth == address(0)) revert ZeroAddress();
        weth = _weth;
    }

    /**
     * @notice Execute an arbitrage using a flash loan
     * @param provider The flash loan provider to use
     * @param token The token to flash loan
     * @param amount The amount to flash loan
     * @param params The arbitrage parameters (swaps and bribe)
     */
    function go(
        FlashLoanProvider provider,
        address token,
        uint256 amount,
        ArbParams calldata params
    ) external onlyOwner nonReentrant {
        if (emergencyStopped) revert EmergencyStopped();
        if (params.swaps.length == 0) revert InvalidSwapConfig();
        if (params.bribeBps > 10000) revert InvalidBribeBps();

        // Store caller and init gas for use in callback
        _flashLoanCaller = msg.sender;
        _initGas = gasleft();

        // Validate all swappers are approved
        for (uint256 i = 0; i < params.swaps.length; i++) {
            if (!approvedSwappers[address(params.swaps[i].swapper)]) {
                revert SwapperNotApproved(address(params.swaps[i].swapper));
            }
        }

        // Encode params for flash loan callback
        bytes memory userData = abi.encode(params);

        if (provider == FlashLoanProvider.BALANCER) {
            if (balancerVault == address(0)) revert FlashLoanProviderNotSet();

            IERC20[] memory tokens = new IERC20[](1);
            tokens[0] = IERC20(token);
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = amount;

            IBalancerVault(balancerVault).flashLoan(
                IFlashLoanRecipient(address(this)),
                tokens,
                amounts,
                userData
            );
        } else if (provider == FlashLoanProvider.MORPHO) {
            if (morpho == address(0)) revert FlashLoanProviderNotSet();

            IMorpho(morpho).flashLoan(token, amount, userData);
        }

        // Clear temporary storage
        _flashLoanCaller = address(0);
        _initGas = 0;
    }

    /**
     * @notice Balancer flash loan callback
     * @dev Called by Balancer Vault during flash loan execution
     */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        if (msg.sender != balancerVault) revert UnauthorizedFlashLoanCallback();
        if (_flashLoanCaller == address(0)) revert InvalidFlashLoanCaller();

        address token = address(tokens[0]);
        uint256 amount = amounts[0];
        uint256 fee = feeAmounts[0];

        _executeArbitrage(token, amount, fee, userData);

        // Repay flash loan
        IERC20(token).safeTransfer(balancerVault, amount + fee);
    }

    /**
     * @notice Morpho flash loan callback
     * @dev Called by Morpho during flash loan execution
     */
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        if (msg.sender != morpho) revert UnauthorizedFlashLoanCallback();
        if (_flashLoanCaller == address(0)) revert InvalidFlashLoanCaller();

        // Decode the token from the first swap config
        ArbParams memory params = abi.decode(data, (ArbParams));
        address token = params.swaps[0].tokenIn;

        _executeArbitrage(token, assets, 0, data);

        // Repay flash loan (Morpho has no fee)
        IERC20(token).safeTransfer(morpho, assets);
    }

    /**
     * @notice Internal function to execute the arbitrage swaps
     * @param inputToken The flash loaned token
     * @param inputAmount The flash loaned amount
     * @param flashLoanFee The flash loan fee to account for
     * @param userData Encoded ArbParams
     */
    function _executeArbitrage(
        address inputToken,
        uint256 inputAmount,
        uint256 flashLoanFee,
        bytes memory userData
    ) internal {
        ArbParams memory params = abi.decode(userData, (ArbParams));

        uint256 currentAmount = inputAmount;

        // Execute swaps sequentially
        for (uint256 i = 0; i < params.swaps.length; i++) {
            SwapConfig memory swap = params.swaps[i];

            // For first swap, use flash loaned amount; for subsequent, use output from previous
            uint256 amountIn = i == 0 ? inputAmount : currentAmount;

            // Approve swapper to spend tokens
            IERC20(swap.tokenIn).forceApprove(address(swap.swapper), amountIn);

            // Execute swap
            currentAmount = swap.swapper.swap(
                swap.tokenIn,
                swap.tokenOut,
                amountIn,
                swap.data
            );
        }

        // Get the final output token
        address outputToken = params.swaps[params.swaps.length - 1].tokenOut;

        // Convert output to WETH if not already
        if (outputToken != weth) {
            // The final swap should output to WETH - if not, we need an extra swap
            // For now, we require the path to end in WETH
            revert InvalidSwapConfig();
        }

        // Calculate total amount we need to repay (input + fee)
        uint256 repayAmount = inputAmount + flashLoanFee;

        // If input token is not WETH, we need to swap some WETH back to repay
        uint256 wethForProfit;
        if (inputToken != weth) {
            // We need to convert some WETH to input token to repay the flash loan
            // This requires an additional approved swapper call
            // For simplicity, require flash loans in WETH
            revert InvalidSwapConfig();
        } else {
            // Input was WETH, output is WETH
            // Profit = output - input - fee
            if (currentAmount <= repayAmount) {
                revert NotProfitable(currentAmount, repayAmount);
            }
            wethForProfit = currentAmount - repayAmount;
        }

        // Calculate gas cost
        uint256 gasUsed = 28000 + (24 * msg.data.length) + (_initGas - gasleft());
        uint256 gasCost = tx.gasprice * gasUsed;

        // Convert WETH profit to ETH
        IWETH(weth).withdraw(wethForProfit);
        uint256 ethBalance = address(this).balance;

        // Check profitability after gas
        if (ethBalance <= gasCost) {
            revert NotProfitable(ethBalance, gasCost);
        }

        uint256 netProfit = ethBalance - gasCost;

        // Calculate and pay bribe to block producer
        uint256 bribeAmount = 0;
        if (params.bribeBps > 0 && block.coinbase != address(0)) {
            bribeAmount = (netProfit * params.bribeBps) / 10000;
            if (bribeAmount > 0) {
                (bool bribeSuccess, ) = block.coinbase.call{value: bribeAmount}("");
                require(bribeSuccess, "Bribe transfer failed");
                emit BribePaid(block.coinbase, bribeAmount);
            }
        }

        // Send remaining profit to caller
        uint256 callerProfit = ethBalance - bribeAmount;
        if (callerProfit > 0) {
            (bool success, ) = _flashLoanCaller.call{value: callerProfit}("");
            require(success, "Profit transfer failed");
        }

        emit ArbitrageExecuted(
            _flashLoanCaller,
            inputToken,
            inputAmount,
            callerProfit,
            bribeAmount,
            gasCost
        );
    }

    /**
     * @notice Set flash loan provider addresses
     * @param _balancerVault Balancer Vault address
     * @param _morpho Morpho address
     */
    function setFlashLoanProviders(address _balancerVault, address _morpho) external onlyOwner {
        balancerVault = _balancerVault;
        morpho = _morpho;
        emit FlashLoanProvidersSet(_balancerVault, _morpho);
    }

    /**
     * @notice Set approval status for a swapper contract
     * @param swapper The swapper contract address
     * @param approved Whether the swapper is approved
     */
    function setSwapperApproval(address swapper, bool approved) external onlyOwner {
        if (swapper == address(0)) revert ZeroAddress();
        approvedSwappers[swapper] = approved;
        emit SwapperApprovalSet(swapper, approved);
    }

    /**
     * @notice Batch set approval for multiple swappers
     * @param swappers Array of swapper addresses
     * @param approved Whether to approve or revoke
     */
    function setSwapperApprovalBatch(
        address[] calldata swappers,
        bool approved
    ) external onlyOwner {
        for (uint256 i = 0; i < swappers.length; i++) {
            if (swappers[i] == address(0)) revert ZeroAddress();
            approvedSwappers[swappers[i]] = approved;
            emit SwapperApprovalSet(swappers[i], approved);
        }
    }

    /**
     * @notice Set emergency stop flag
     * @param stopped Whether to stop the contract
     */
    function setEmergencyStop(bool stopped) external onlyOwner {
        emergencyStopped = stopped;
        emit EmergencyStopSet(stopped);
    }

    /**
     * @notice Withdraw ERC20 tokens from the contract
     * @param token The token to withdraw
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Withdraw ETH from the contract
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Check if a swapper is approved
     * @param swapper The swapper address to check
     * @return Whether the swapper is approved
     */
    function isSwapperApproved(address swapper) external view returns (bool) {
        return approvedSwappers[swapper];
    }

    /// @notice Allow contract to receive ETH
    receive() external payable {}
}
