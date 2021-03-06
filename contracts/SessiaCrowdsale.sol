pragma solidity ^0.4.15;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "./SessiaToken.sol";
import "./Haltable.sol";
import "./MultiOwners.sol";


contract StagePercentageStep is MultiOwners {
    using SafeMath for uint256;

    string public name;
    uint256 public tokenPriceInETH;
    uint256 public mintCapInETH;
    uint256 public mintCapInUSD;
    uint256 public mintCapInTokens;
    uint256 public hardCapInTokens;
    uint256 public totalWei;
    uint256 public bonusAvailable;
    uint256 public bonusTotalSupply;
    

    struct Round {
        uint256 windowInTokens;
        uint256 windowInETH;
        uint256 accInETH;
        uint256 accInTokens;
        uint256 nextAccInETH;
        uint256 nextAccInTokens;
        uint256 discount;
        uint256 priceInETH;
        uint256 weightPercentage;
    }
    
    Round[] public rounds;
    
    function StagePercentageStep(string _name) {
        name = _name;
    }
    
    function totalEther() public constant returns(uint256) {
        return totalWei.div(1e18);
    }

    function registerRound(uint256 priceDiscount, uint256 weightPercentage) internal {
        uint256 windowInETH;
        uint256 windowInTokens;
        uint256 accInETH = 0;
        uint256 accInTokens = 0;
        uint256 priceInETH;
        
        
        priceInETH = tokenPriceInETH.mul(100-priceDiscount).div(100);
        windowInETH = mintCapInETH.mul(weightPercentage).div(100);
        windowInTokens = windowInETH.mul(1e18).div(priceInETH);

        if(rounds.length > 0) {
            accInTokens = accInTokens.add(rounds[rounds.length-1].nextAccInTokens);
            accInETH = accInETH.add(rounds[rounds.length-1].nextAccInETH);
        }

        rounds.push(Round({
            windowInETH: windowInETH,
            windowInTokens: windowInTokens,
            accInETH: accInETH,
            accInTokens: accInTokens,
            nextAccInETH: accInETH + windowInETH,
            nextAccInTokens: accInTokens + windowInTokens,
            weightPercentage: weightPercentage,
            discount: priceDiscount,
            priceInETH: priceInETH
        }));
        mintCapInTokens = mintCapInTokens.add(windowInTokens);
        hardCapInTokens = mintCapInTokens.mul(120).div(100);
    }
    
    /*
     * @dev calculate amount
     * @param _value ether to be converted to tokens
     * @param _totalEthers total received ETH
     * @return tokens amount that we should send to our dear investor
     * @return odd ethers amount, which contract should send back
     */
    function calcAmount(
        uint256 _amount,
        uint256 _totalEthers
    ) public constant returns (uint256 estimate, uint256 amount) {
        Round memory round;
        uint256 totalEthers = _totalEthers;
        amount = _amount;
        
        for(uint256 i; i<rounds.length; i++) {
            round = rounds[i];

            if(!(totalEthers >= round.accInETH && totalEthers < round.nextAccInETH)) {
                continue;
            }
            
            if(totalEthers.add(amount) < round.nextAccInETH) {
                return (estimate + amount.mul(1e18).div(round.priceInETH), 0);
            }

            amount = amount.sub(round.nextAccInETH.sub(totalEthers));
            estimate = estimate + (
                round.nextAccInETH.sub(totalEthers).mul(1e18).div(round.priceInETH)
            );
            totalEthers = round.nextAccInETH;
        }
        return (estimate, amount);
    }    
}


contract SessiaCrowdsale is StagePercentageStep, Haltable {
    using SafeMath for uint256;

    // min wei per tx
    uint256 public ethPriceInUSD = 680e2; // 460 USD per one ETH
    uint256 public minimalUSD = 680e2; // minimal sale 500 USD
    uint256 public minimalWei = minimalUSD.mul(1e18).div(ethPriceInUSD); // 1.087 ETH

    // Token
    SessiaToken public token;

    // Withdraw wallet
    address public wallet;

    // period
    uint256 public startTime;
    uint256 public endTime;

    //
    address public bonusMintingAgent;


    event ETokenPurchase(address indexed beneficiary, uint256 value, uint256 amount);
    event ETransferOddEther(address indexed beneficiary, uint256 value);
    event ESetBonusMintingAgent(address agent);
    event ESetStartTime(uint256 new_startTime);
    event ESetEndTime(uint256 new_endTime);
    event EManualMinting(address indexed beneficiary, uint256 value, uint256 amount);
    event EBonusMinting(address indexed beneficiary, uint256 value);


    modifier validPurchase() {
        bool nonZeroPurchase = msg.value != 0;
        
        require(withinPeriod() && nonZeroPurchase);

        _;        
    }

    function SessiaCrowdsale(
        uint256 _startTime,  // 1526482800 05/16/2018 @ 3:00pm (UTC)
        uint256 _endTime,  //  1537110000 09/16/2018 @ 3:00pm (UTC)
        address _wallet,  // 0x62926204Fb0f6B01D9530C0d2AcCe194b07dEfA8
        address _bonusMintingAgent
    )
        public
        StagePercentageStep("Pre-ITO") 
     {
        require(_startTime >= 0);
        require(_endTime > _startTime);

        token = new SessiaToken();
        token.grant(_bonusMintingAgent);
        token.grant(_wallet);

        bonusMintingAgent = _bonusMintingAgent;
        wallet = _wallet;

        startTime = _startTime;
        endTime = _endTime;

        tokenPriceInETH = 1e15; // 0.001 ETH
        mintCapInUSD = 3000000e2; // 3.000.000 USD * 100 cents
        mintCapInETH = mintCapInUSD.mul(1e18).div(ethPriceInUSD);
    
        registerRound({priceDiscount: 30, weightPercentage: 10});
        registerRound({priceDiscount: 20, weightPercentage: 20});
        registerRound({priceDiscount: 10, weightPercentage: 30});
        registerRound({priceDiscount: 0, weightPercentage: 40});
    
        require(bonusMintingAgent != 0);
        require(wallet != 0x0);
    }

    function withinPeriod() constant public returns (bool) {
        return (now >= startTime && now <= endTime);
    }

    // @return false if crowdsale event was ended
    function running() constant public returns (bool) {
        return withinPeriod() && !token.mintingFinished();
    }

    /*
     * @dev change agent for bonus minting
     * @praram agent new agent address
     */
    function setBonusMintingAgent(address agent) public onlyOwner {
        require(agent != address(this));
        token.revoke(bonusMintingAgent);
        token.grant(agent);
        bonusMintingAgent = agent;
        ESetBonusMintingAgent(agent);
    }

    // @return current stage name
    function stageName() constant public returns (string) {
        bool beforePeriod = (now < startTime);

        if(beforePeriod) {
            return "Not started";
        }

        if(withinPeriod()) {
            return name;
        } 

        return "Finished";
    }

    /*
     * @dev fallback for processing ether
     */
    function() public payable {
        return buyTokens(msg.sender);
    }

    /*
     * @dev set start date
     * @param _at — new start date
     */
    function setStartTime(uint256 _at) public onlyOwner {
        require(block.timestamp < _at); // should be great than current block timestamp
        require(_at < endTime);

        startTime = _at;
        ESetStartTime(_at);
    }

    /*
     * @dev set end date
     * @param _at — new end date
     */
    function setEndTime(uint256 _at) public onlyOwner {
        require(startTime < _at);  // should be great than current block timestamp

        endTime = _at;
        ESetEndTime(_at);
    }

    /*
     * @dev Large Token Holder minting 
     * @param to - mint to address
     * @param amount - how much mint
     */
    function bonusMinting(address to, uint256 amount) stopInEmergency public {
        require(msg.sender == bonusMintingAgent || isOwner());
        require(amount <= bonusAvailable);
        require(token.totalSupply() + amount <= hardCapInTokens);

        bonusTotalSupply = bonusTotalSupply.add(amount);
        bonusAvailable = bonusAvailable.sub(amount);
        EBonusMinting(to, amount);
        token.mint(to, amount);
    }

    /*
     * @dev sell token and send to contributor address
     * @param contributor address
     */
    function buyTokens(address contributor) payable stopInEmergency validPurchase public {
        require(contributor != 0x0);
        require(msg.value >= minimalWei);

        uint256 amount;
        uint256 odd_ethers;
        uint256 ethers;
        
        (amount, odd_ethers) = calcAmount(msg.value, totalWei);  
        require(amount + token.totalSupply() + bonusAvailable <= hardCapInTokens);

        ethers = (msg.value.sub(odd_ethers));

        token.mint(contributor, amount); // fail if minting is finished
        ETokenPurchase(contributor, ethers, amount);
        totalWei = totalWei.add(ethers);

        if(odd_ethers > 0) {
            require(odd_ethers < msg.value);
            ETransferOddEther(contributor, odd_ethers);
            contributor.transfer(odd_ethers);
        }
        bonusAvailable = bonusAvailable.add(amount.mul(20).div(100));

        wallet.transfer(ethers);
    }


    /*
     * @dev manual tokens issuing
     * @param contributor address, etheres
     */
    function manualMinting(address contributor, uint256 value) onlyOwner stopInEmergency public {
        require(withinPeriod());
        require(contributor != 0x0);
        require(value >= minimalWei);

        uint256 amount;
        uint256 odd_ethers;
        uint256 ethers;
        
        (amount, odd_ethers) = calcAmount(value, totalWei);
        require(amount + token.totalSupply() + bonusAvailable <= hardCapInTokens);

        ethers = value.sub(odd_ethers);

        token.mint(contributor, amount); // fail if minting is finished
        EManualMinting(contributor, amount, ethers);
        totalWei = totalWei.add(ethers);
        bonusAvailable = bonusAvailable.add(amount.mul(20).div(100));
    }

    function finishCrowdsale() onlyOwner public {
        require(block.timestamp > endTime || (mintCapInETH - totalWei) <= 1e18);
        require(!token.mintingFinished());

        if(bonusAvailable > 0) {
            bonusMinting(wallet, bonusAvailable);
        }
        token.finishMinting();
    }

}