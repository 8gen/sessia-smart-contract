pragma solidity ^0.4.15;

import "zeppelin-solidity/contracts/token/MintableToken.sol";
import "./MultiOwners.sol";


contract SessiaToken is MintableToken, MultiOwners {

    string public constant name = "Sessia Kickers";
    string public constant symbol = "PRE-KICK";
    uint8 public constant decimals = 18;

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        if(!isOwner()) {
            revert();
        }
        return super.transferFrom(from, to, value);
    }

    function transfer(address to, uint256 value) public returns (bool) {
        if(!isOwner()) {
            revert();
        }
        return super.transfer(to, value);
    }

    function grant(address _owner) public {
        require(publisher == msg.sender);
        return super.grant(_owner);
    }

    function revoke(address _owner) public {
        require(publisher == msg.sender);
        return super.revoke(_owner);
    }

    function mint(address _to, uint256 _amount) public returns (bool) {
        require(publisher == msg.sender);
        return super.mint(_to, _amount);
    }

}
