// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../helpers/BoringOwnable.sol";

contract ExampleERC721 is ERC721, BoringOwnable  {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    mapping(uint256 => string) private _tokenURI;
    /**
     * @dev Initializes the contract by setting a `name` and a `symbol` to the token collection.
     */
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
        _tokenIds.increment(); // Start from 1
    }

    function tokenURI(uint256 tokenId) public override view returns (string memory) {
        _requireMinted(tokenId);
        return _tokenURI[tokenId];
    }

    function mint(string memory uri) external returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _tokenURI[newTokenId] = uri;
        _mint(msg.sender, newTokenId);

        return newTokenId;
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIds.current();
    }
}