pragma solidity ^0.4.15;

import 'zeppelin-solidity/contracts/token/MintableToken.sol';


contract SessiaToken is MintableToken {

    string public constant name = 'Sessia Kickers';
    string public constant symbol = 'pKICK';
    uint8 public constant decimals = 18;

    function transferFrom(address from, address to, uint256 value) returns (bool) {
        revert();
    }

    function transfer(address to, uint256 value) returns (bool) {
        revert();
    }
}
