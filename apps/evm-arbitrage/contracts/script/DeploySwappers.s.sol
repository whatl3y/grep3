// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/swappers/UniswapV2Swapper.sol";
import "../src/swappers/UniswapV3Swapper.sol";
import "../src/swappers/UniswapV4Swapper.sol";
import "../src/swappers/CurveSwapper.sol";
import "../src/swappers/BalancerSwapper.sol";
import "../src/swappers/AlgebraSwapper.sol";
import "../src/swappers/SolidlySwapper.sol";

/**
 * @title DeploySwappers
 * @notice Deployment script for all swapper contracts
 * @dev Run with: forge script script/DeploySwappers.s.sol --rpc-url $RPC_URL --broadcast
 */
contract DeploySwappers is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy all swappers
        UniswapV2Swapper uniswapV2Swapper = new UniswapV2Swapper();
        console.log("UniswapV2Swapper deployed at:", address(uniswapV2Swapper));

        UniswapV3Swapper uniswapV3Swapper = new UniswapV3Swapper();
        console.log("UniswapV3Swapper deployed at:", address(uniswapV3Swapper));

        UniswapV4Swapper uniswapV4Swapper = new UniswapV4Swapper();
        console.log("UniswapV4Swapper deployed at:", address(uniswapV4Swapper));

        CurveSwapper curveSwapper = new CurveSwapper();
        console.log("CurveSwapper deployed at:", address(curveSwapper));

        BalancerSwapper balancerSwapper = new BalancerSwapper();
        console.log("BalancerSwapper deployed at:", address(balancerSwapper));

        AlgebraSwapper algebraSwapper = new AlgebraSwapper();
        console.log("AlgebraSwapper deployed at:", address(algebraSwapper));

        SolidlySwapper solidlySwapper = new SolidlySwapper();
        console.log("SolidlySwapper deployed at:", address(solidlySwapper));

        vm.stopBroadcast();

        // Log summary
        console.log("\n=== Deployment Summary ===");
        console.log("UniswapV2Swapper:", address(uniswapV2Swapper));
        console.log("UniswapV3Swapper:", address(uniswapV3Swapper));
        console.log("UniswapV4Swapper:", address(uniswapV4Swapper));
        console.log("CurveSwapper:", address(curveSwapper));
        console.log("BalancerSwapper:", address(balancerSwapper));
        console.log("AlgebraSwapper:", address(algebraSwapper));
        console.log("SolidlySwapper:", address(solidlySwapper));
    }
}

/**
 * @title DeploySwappersSelective
 * @notice Deploy only specific swappers based on chain
 */
contract DeploySwappersSelective is Script {
    function deployEthereum() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Ethereum mainnet swappers
        new UniswapV2Swapper();
        new UniswapV3Swapper();
        new UniswapV4Swapper();
        new CurveSwapper();
        new BalancerSwapper();

        vm.stopBroadcast();
    }

    function deployArbitrum() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Arbitrum swappers
        new UniswapV2Swapper(); // SushiSwap
        new UniswapV3Swapper();
        new UniswapV4Swapper();
        new AlgebraSwapper(); // Camelot V3
        new BalancerSwapper();
        new CurveSwapper();

        vm.stopBroadcast();
    }

    function deployBase() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Base swappers
        new UniswapV2Swapper();
        new UniswapV3Swapper();
        new UniswapV4Swapper();
        new SolidlySwapper(); // Aerodrome

        vm.stopBroadcast();
    }

    function deployOptimism() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Optimism swappers
        new UniswapV3Swapper();
        new SolidlySwapper(); // Velodrome

        vm.stopBroadcast();
    }

    function deployBSC() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // BSC swappers
        new UniswapV2Swapper(); // PancakeSwap V2, BabyDogeSwap
        new UniswapV3Swapper(); // PancakeSwap V3

        vm.stopBroadcast();
    }

    function deployPolygon() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Polygon swappers
        new UniswapV2Swapper(); // SushiSwap, QuickSwap V2
        new UniswapV3Swapper();
        new AlgebraSwapper(); // QuickSwap V3
        new BalancerSwapper();
        new CurveSwapper();

        vm.stopBroadcast();
    }
}
