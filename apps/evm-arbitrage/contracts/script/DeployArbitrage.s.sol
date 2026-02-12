// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Arbitrage.sol";
import "../src/swappers/UniswapV2Swapper.sol";
import "../src/swappers/UniswapV3Swapper.sol";
import "../src/swappers/UniswapV4Swapper.sol";
import "../src/swappers/CurveSwapper.sol";
import "../src/swappers/BalancerSwapper.sol";
import "../src/swappers/AlgebraSwapper.sol";
import "../src/swappers/SolidlySwapper.sol";

/**
 * @title DeployArbitrage
 * @notice Deployment script for the main Arbitrage contract
 * @dev Run with: forge script script/DeployArbitrage.s.sol --rpc-url $RPC_URL --broadcast
 */
contract DeployArbitrage is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address weth = vm.envAddress("WETH_ADDRESS");
        address balancerVault = vm.envOr("BALANCER_VAULT", address(0));
        address morpho = vm.envOr("MORPHO_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        Arbitrage arbitrage = new Arbitrage(weth);
        console.log("Arbitrage deployed at:", address(arbitrage));
        console.log("WETH address:", weth);

        // Set flash loan providers if provided
        if (balancerVault != address(0) || morpho != address(0)) {
            arbitrage.setFlashLoanProviders(balancerVault, morpho);
            console.log("Balancer Vault:", balancerVault);
            console.log("Morpho:", morpho);
        }

        vm.stopBroadcast();
    }

    /**
     * @notice Deploy and configure with swappers and flash loan providers
     * @param swappers Array of swapper addresses to approve
     */
    function runWithSwappers(address[] calldata swappers) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address weth = vm.envAddress("WETH_ADDRESS");
        address balancerVault = vm.envOr("BALANCER_VAULT", address(0));
        address morpho = vm.envOr("MORPHO_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        Arbitrage arbitrage = new Arbitrage(weth);
        console.log("Arbitrage deployed at:", address(arbitrage));
        console.log("WETH address:", weth);

        // Set flash loan providers if provided
        if (balancerVault != address(0) || morpho != address(0)) {
            arbitrage.setFlashLoanProviders(balancerVault, morpho);
            console.log("Balancer Vault:", balancerVault);
            console.log("Morpho:", morpho);
        }

        // Approve all swappers
        arbitrage.setSwapperApprovalBatch(swappers, true);
        console.log("Approved", swappers.length, "swappers");

        vm.stopBroadcast();
    }
}

/**
 * @title ConfigureArbitrage
 * @notice Script to configure an existing Arbitrage contract
 */
contract ConfigureArbitrage is Script {
    function approveSwappers(
        address arbitrageAddress,
        address[] calldata swappers
    ) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        Arbitrage arbitrage = Arbitrage(payable(arbitrageAddress));
        arbitrage.setSwapperApprovalBatch(swappers, true);

        console.log("Approved", swappers.length, "swappers on Arbitrage at:", arbitrageAddress);

        vm.stopBroadcast();
    }

    function revokeSwappers(
        address arbitrageAddress,
        address[] calldata swappers
    ) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        Arbitrage arbitrage = Arbitrage(payable(arbitrageAddress));
        arbitrage.setSwapperApprovalBatch(swappers, false);

        console.log("Revoked", swappers.length, "swappers on Arbitrage at:", arbitrageAddress);

        vm.stopBroadcast();
    }

    function setEmergencyStop(
        address arbitrageAddress,
        bool stopped
    ) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        Arbitrage arbitrage = Arbitrage(payable(arbitrageAddress));
        arbitrage.setEmergencyStop(stopped);

        console.log("Emergency stop set to:", stopped, "on Arbitrage at:", arbitrageAddress);

        vm.stopBroadcast();
    }

    function setFlashLoanProviders(
        address arbitrageAddress,
        address balancerVault,
        address morpho
    ) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        Arbitrage arbitrage = Arbitrage(payable(arbitrageAddress));
        arbitrage.setFlashLoanProviders(balancerVault, morpho);

        console.log("Flash loan providers set on Arbitrage at:", arbitrageAddress);
        console.log("Balancer Vault:", balancerVault);
        console.log("Morpho:", morpho);

        vm.stopBroadcast();
    }
}

/**
 * @title DeployAll
 * @notice Deploy all contracts (swappers + arbitrage) in one transaction
 */
contract DeployAll is Script {
    struct Deployment {
        address arbitrage;
        address uniswapV2Swapper;
        address uniswapV3Swapper;
        address uniswapV4Swapper;
        address curveSwapper;
        address balancerSwapper;
        address algebraSwapper;
        address solidlySwapper;
    }

    function run() external returns (Deployment memory deployment) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address weth = vm.envAddress("WETH_ADDRESS");
        address balancerVault = vm.envOr("BALANCER_VAULT", address(0));
        address morpho = vm.envOr("MORPHO_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy swappers
        deployment.uniswapV2Swapper = address(new UniswapV2Swapper());
        deployment.uniswapV3Swapper = address(new UniswapV3Swapper());
        deployment.uniswapV4Swapper = address(new UniswapV4Swapper());
        deployment.curveSwapper = address(new CurveSwapper());
        deployment.balancerSwapper = address(new BalancerSwapper());
        deployment.algebraSwapper = address(new AlgebraSwapper());
        deployment.solidlySwapper = address(new SolidlySwapper());

        // Deploy arbitrage
        Arbitrage arbitrage = new Arbitrage(weth);
        deployment.arbitrage = address(arbitrage);

        // Set flash loan providers if provided
        if (balancerVault != address(0) || morpho != address(0)) {
            arbitrage.setFlashLoanProviders(balancerVault, morpho);
        }

        // Approve all swappers
        address[] memory swappers = new address[](7);
        swappers[0] = deployment.uniswapV2Swapper;
        swappers[1] = deployment.uniswapV3Swapper;
        swappers[2] = deployment.uniswapV4Swapper;
        swappers[3] = deployment.curveSwapper;
        swappers[4] = deployment.balancerSwapper;
        swappers[5] = deployment.algebraSwapper;
        swappers[6] = deployment.solidlySwapper;

        arbitrage.setSwapperApprovalBatch(swappers, true);

        vm.stopBroadcast();

        // Log deployment summary
        console.log("\n=== Full Deployment Summary ===");
        console.log("Arbitrage:", deployment.arbitrage);
        console.log("UniswapV2Swapper:", deployment.uniswapV2Swapper);
        console.log("UniswapV3Swapper:", deployment.uniswapV3Swapper);
        console.log("UniswapV4Swapper:", deployment.uniswapV4Swapper);
        console.log("CurveSwapper:", deployment.curveSwapper);
        console.log("BalancerSwapper:", deployment.balancerSwapper);
        console.log("AlgebraSwapper:", deployment.algebraSwapper);
        console.log("SolidlySwapper:", deployment.solidlySwapper);
        console.log("Balancer Vault:", balancerVault);
        console.log("Morpho:", morpho);

        return deployment;
    }
}
