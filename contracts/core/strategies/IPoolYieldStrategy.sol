// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPoolYieldStrategy {
    event Deposit(address indexed strategy, address indexed token, uint256 amount);
    event Withdraw(address indexed strategy, address indexed token, uint256 amount);
}