// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mintable is ERC20 {

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function selfMint(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    function mintTo(address receiver, uint256 amount) external {
        _mint(receiver, amount);
    }
}