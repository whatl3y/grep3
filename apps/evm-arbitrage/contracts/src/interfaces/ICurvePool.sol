// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICurvePool
 * @notice Interface for Curve pools (StableSwap and CryptoSwap)
 */
interface ICurvePool {
    // Standard StableSwap interface (2 coins)
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    // CryptoSwap interface (uint256 indices)
    function exchange(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    // Exchange with receiver
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy,
        address receiver
    ) external returns (uint256);

    function get_dy(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256);

    function get_dy(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external view returns (uint256);

    function coins(uint256 index) external view returns (address);
    function balances(uint256 index) external view returns (uint256);

    // Meta pool interface
    function exchange_underlying(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}

/**
 * @title ICurveRegistry
 * @notice Interface for Curve Registry
 */
interface ICurveRegistry {
    function find_pool_for_coins(
        address from,
        address to,
        uint256 i
    ) external view returns (address);

    function get_coin_indices(
        address pool,
        address from,
        address to
    ) external view returns (int128, int128, bool);
}
