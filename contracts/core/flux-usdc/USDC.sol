// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { ERC20Mintable } from "../erc20/ERC20Mintable.sol";

contract USDC is ERC20Mintable {

    constructor() ERC20Mintable("USDC", "USDC") {}

}