import increaseTime, { duration } from 'zeppelin-solidity/test/helpers/increaseTime';


var Token = artifacts.require('./SessiaToken.sol');
var Crowdsale = artifacts.require('./SessiaCrowdsale.sol');


contract('Crowdsale', () => {
    let owner, token, sale;
    let startTime;
    let client1, client2;
    let wallet;
    let bonusMintingAgent;

    before(async () => {
        owner = web3.eth.accounts[0];
        client1 = web3.eth.accounts[1];
        client2 = web3.eth.accounts[2];
        wallet = web3.eth.accounts[5];
        bonusMintingAgent = web3.eth.accounts[6];
    });

    let balanceEqualTo = async (client, should_balance) => {
        let balance;

        balance = await token.balanceOf(client, {from: client});
        assert.equal((balance.toNumber()/1e18).toFixed(4), (should_balance/1e18).toFixed(4), `Token balance should be equal to ${should_balance}`);
    };

    let shouldHaveException = async (fn, error_msg) => {
        let has_error = false;

        try {
            await fn();
        } catch(err) {
            has_error = true;
        } finally {
            assert.equal(has_error, true, error_msg);
        }        
    };

    let check_constant = async (key, value, text) => {
        assert.equal(((await sale[key]()).toNumber()/1e18).toFixed(2), value, text);
    };

    let check_calcAmount = async (ethers, totalWei, should_tokens, should_odd_ethers) => {
        should_tokens = ((should_tokens || 0)/1e18).toFixed(2);
        should_odd_ethers = ((should_odd_ethers || 0)/1e18).toFixed(2);

        let text = `Check KICK — ${ethers/1e18} ETH → ${should_tokens} KICK`;
        let textOdd = `Check odd ETH — ${ethers/1e18} ETH → ${should_odd_ethers} ETH`;

        let result = await sale.calcAmount(ethers, totalWei);
        let tokens = (result[0].toNumber()/1e18).toFixed(2);
        let odd_ethers = (result[1].toNumber()/1e18).toFixed(2);

        assert.equal(tokens, should_tokens, text);
        assert.equal(odd_ethers, should_odd_ethers, textOdd);
    };

    beforeEach(async function () {
        startTime = web3.eth.getBlock('latest').timestamp + duration.weeks(1);

        sale = await Crowdsale.new(
            startTime,
            startTime + duration.days(5 * 31),
            wallet,
            bonusMintingAgent,
        );
        token = await Token.at(await sale.token());
    });
  
    it('token.totalSupply → Check balance and totalSupply before donate', async () => {
        assert.equal((await token.balanceOf(client1)).toNumber(), 0, 'balanceOf must be 0 on the start');
        assert.equal((await token.totalSupply()), 0, 'totalSupply must be 0 on the start');
    });

    it('running → check ITO is started', async() => {
        assert.equal((await sale.running()), false);
        await increaseTime(duration.weeks(1));
        assert.equal((await sale.running()), true);
    });

    it('calcAmountAt → PRE-ITO', async() => {
        await check_constant('hardCapInTokens', '5962184.87');

    
        // 30% 0.00070 | 10 ETH -> 14285.71 KICK
        // 20% 0.00080 | 10 ETH -> 12500.00 KICK
        // 10% 0.00090 | 10 ETH -> 11111.11 KICK
        //  0% 0.00010 | 10 ETH -> 10000.00 KICK
    
        await check_calcAmount(10e18, 0, 14285.71e18, 0);
        await check_calcAmount(10e18, 442e18, 12500.00e18, 0);
        await check_calcAmount(10e18, 1324e18, 11111.11e18, 0);
        await check_calcAmount(10e18, 3000e18, 10000.00e18, 0);
        await check_calcAmount(10e18, 4413e18, 0, 10e18);
    });

    it('calcAmountAt → golden tx', async() => {
        let mintCapInTokens = await sale.mintCapInTokens();
        await check_calcAmount(5000e18, 0, mintCapInTokens, 588.24e18);
    });

    it('token.transfer → forbid transfer and transferFrom until PRE-ITO', async() => {
        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: 2e18, gas: 150000});

        await shouldHaveException(async () => {
            await token.transfer(client1, 1e8, {from: client1});
        }, 'Should has an error');

        await shouldHaveException(async () => {
            await token.transferFrom(client1, client1, 1e8, {from: client1});
        }, 'Should has an error');

        await shouldHaveException(async () => {
            await sale.refund({from: client1});
        }, 'Should has an error');
    });

    it('token.transfer → forbied transfer token after PRE-ITO', async () => {
        await increaseTime(duration.weeks(1));

        await web3.eth.sendTransaction({from: client1, to: sale.address, value: 2e18, gas: 150000});
        await increaseTime(duration.days(5*31 + 1));
        await sale.finishCrowdsale();

        assert.equal((await token.mintingFinished()), true, 'token.mintingFinished should true');


        await shouldHaveException(async () => {
            await token.transfer(client2, 1e18, {from: client1});
        }, 'Should has an error');
    });

    it('minimalTokenPrice → do not allow to sell less than minimalTokenPrice', async() => {
        await increaseTime(duration.weeks(1));

        await web3.eth.sendTransaction({from: client1, to: sale.address, value: 2e18, gas: 150000});

        await shouldHaveException(async () => {
            await web3.eth.sendTransaction({from: client1, to: sale.address, value: 0.9e18});
        }, 'Should has an error');
    });

    it('withdraw → check ether transfer to wallet', async() => {
        let balance1, balance2;

        balance1 = await web3.eth.getBalance(wallet);
        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: 2e18, gas: 150000});
        balance2 = await web3.eth.getBalance(wallet);

        assert.equal(Math.round((balance2 - balance1)/1e14), 2e4);
    });


    it('finishCrowdsale → finish minting', async() => {
        let tokenOnClient, totalSupply;

        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: 10e18, gas: 150000});

        tokenOnClient = (await token.balanceOf(client1)).toNumber();
        totalSupply = (await token.totalSupply()).toNumber();
        assert.equal(((totalSupply)/1e18).toFixed(4), (tokenOnClient/1e18).toFixed(4));

        await increaseTime(duration.days(5 * 31 + 1));
        await sale.finishCrowdsale();
        assert.equal((await token.mintingFinished()), true);

        totalSupply = (await token.totalSupply()).toNumber();
        assert.equal((totalSupply/120/1e18*20).toFixed(4), ((await sale.bonusTotalSupply())/1e18).toFixed(4), 'bonus tokens');
    });

    it('buyTokens → received lower than 0.01 ether', async() => {

        await increaseTime(duration.weeks(1));

        let token_purchase_events = (await sale.ETokenPurchase({fromBlock: 0, toBlock: 'latest'}));

        await sale.buyTokens(client2, {from: client1, value: 2e18, gas: 150000});

        token_purchase_events.get((err, events) => {
            assert.equal(events.length, 1);
            assert.equal(events[0].event, 'ETokenPurchase');
        });

        await shouldHaveException(async () => {
            await sale.buyTokens(client2, {from: client1, value: 0.009e18, gas: 150000});
        }, 'Should has an error');
    });

    it('buyTokens → direct call', async() => {
        await increaseTime(duration.weeks(1));

        let client2_balance = (await token.balanceOf(client2));
        await sale.buyTokens(client2, {from: client1, value: 100e18, gas: 150000});
        let client2_balance2 = (await token.balanceOf(client2));
        assert.notEqual(client2_balance, client2_balance2.toNumber());
    });

    it('manualMinting → direct call', async() => {
        await increaseTime(duration.weeks(1));

        let client2_balance = (await token.balanceOf(client2));
        await sale.manualMinting(client2, 1e18, {gas: 150000});
        let client2_balance2 = (await token.balanceOf(client2));
        assert.notEqual(client2_balance, client2_balance2.toNumber());
        assert.notEqual(((await sale.bonusAvailable()).toNumber()/1e18).toFixed(2), 0);
        await shouldHaveException(async () => {
            await sale.manualMinting(client2, 1e18, {
                from: wallet,
                gas: 150000
            });
        }, 'Should has an error');
    });

    it('Check token balance', async() => {
        await increaseTime(duration.weeks(1));

        await balanceEqualTo(client1, 0);

        await web3.eth.sendTransaction({from: client1, to: sale.address, value: web3.toWei(2), gas: 150000});

        await balanceEqualTo(client1, 2e18/0.0007);
    });

    it('After donate', async () => {
        await balanceEqualTo(client1, 0);
        await increaseTime(duration.weeks(1));

        let initialTotalSupply = (await token.totalSupply()).toNumber();
        let tokens = 2e18/0.0007;

        await web3.eth.sendTransaction({from: client1, to: sale.address, value: web3.toWei(2), gas: 150000});

        assert.equal(
            ((initialTotalSupply + tokens)/1e18).toFixed(4),
            ((await token.totalSupply()).toNumber()/1e18).toFixed(4),
            'Client balance must be 1 ether / testRate'
        );
        await balanceEqualTo(client1, tokens);
    });

    it('send → Donate before startTime', async () => {
        await shouldHaveException(async () => {
            await web3.eth.sendTransaction({from: client1, to: sale.address, value: web3.toWei(4), gas: 150000});
        }, 'Should has an error');
    });

    it('send → Donate after startTime', async () => {
        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: web3.toWei(2), gas: 150000});
    });

    it('send → Donate max ether', async () => {
        await increaseTime(duration.weeks(1));
        await sale.mintCapInTokens();
        let mintCapInETH = await sale.mintCapInETH();

        assert.equal((await token.mintingFinished()), false);
        assert.equal((await sale.running()), true);

        await web3.eth.sendTransaction({from: client1, to: sale.address, value: mintCapInETH, gas: 1500000});

        await shouldHaveException(async () => {
            await token.transfer(client2, 1e8, {from: client1});
        }, 'Should has an error');
        
        await sale.finishCrowdsale();

        assert.equal((await sale.running()), false);
        assert.equal((await token.mintingFinished()), true);

        await shouldHaveException(async () => {
            await token.transfer(client2, 1e8, {from: client1});
        }, 'Should has an error');

        await shouldHaveException(async () => {
            await web3.eth.sendTransaction({from: client1, to: sale.address, value: 2e18, gas: 150000});
        }, 'Should has an error');
    });

    it('send → check max Tokens', async () => {
        await increaseTime(duration.weeks(1));
        let mintCapInTokens = await sale.mintCapInTokens();
        let mintCapInETH = await sale.mintCapInETH();
        let client1_before = await web3.eth.getBalance(client1);
        let client1_token_before = await token.balanceOf(client1);

        await web3.eth.sendTransaction({
            from: client1,
            to: sale.address,
            value: 123e18,
            gas: 1500000
        });
        let bonusAvailable = await sale.bonusAvailable();
        await sale.bonusMinting(client2, bonusAvailable, {
            from: bonusMintingAgent,
            gas: 150000
        });

        await shouldHaveException(async () => {
            await sale.finishCrowdsale();
        }, 'Should has an error');

        await web3.eth.sendTransaction({
            from: client1,
            to: sale.address,
            value: mintCapInETH,
            gas: 1500000
        });

        let client1_after = await web3.eth.getBalance(client1);
        let client1_token_after = await token.balanceOf(client1);
        let totalWei = await sale.totalWei();
        assert.notEqual(client1_token_before.toNumber(), client1_token_after.toNumber());
        // console.log(
        //     (mintCapInETH.toNumber() / 1e18).toFixed(2),
        //     (totalWei.toNumber() / 1e18).toFixed(2),
        //     ((client1_before.toNumber() - client1_after.toNumber())/1e18).toFixed(2),
        //     mintCapInETH - totalWei
        // );

        // console.log(
        //     (mintCapInTokens.toNumber() / 1e18).toFixed(2),
        //     ((await token.totalSupply()) / 1e18).toFixed(2),
        //     ((await sale.bonusTotalSupply()) / 1e18).toFixed(2),
        //     ((await sale.bonusAvailable()) / 1e18).toFixed(2)
        // );

        
        await sale.finishCrowdsale();

        // console.log(
        //     (mintCapInTokens.toNumber() / 1e18).toFixed(2),
        //     ((await token.totalSupply()) / 1e18).toFixed(2),
        //     ((await sale.bonusTotalSupply()) / 1e18).toFixed(2),
        //     ((await sale.bonusAvailable()) / 1e18).toFixed(2)
        // );


    });

    it('send → Donate more then max ether', async () => {
        let mintCapInTokens = await sale.mintCapInTokens();
        let mintCapInETH = await sale.mintCapInETH();

        await increaseTime(duration.weeks(1));

        let balance1 = await web3.eth.getBalance(client1);
        let token_balance1 = await token.balanceOf(client1);

        let odd_ethers_events = (await sale.ETransferOddEther({fromBlock: 0, toBlock: 'latest'}))
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: mintCapInETH + 10e18, gas: 150000});

        odd_ethers_events.get((err, events) => {
            assert.equal(events.length, 1);
            assert.equal(events[0].event, 'ETransferOddEther');
        });

        let balance2 = await web3.eth.getBalance(client1);
        let token_balance2 = await token.balanceOf(client1);

        assert.equal((balance1/1e18 - balance2/1e18 - mintCapInETH/1e18).toFixed(), '0', 'Contract should send back our 10 ETH');
        assert.equal(token_balance1.toNumber(), 0);
        assert.equal(Math.round(token_balance2.toNumber()/1e14), Math.round((mintCapInTokens)/1e14));
    });

    it('send → Donate after endTime', async () => {
        await increaseTime(duration.days(5 * 31 + 1 + 7));

        await shouldHaveException(async () => {
            await web3.eth.sendTransaction({from: client, to: sale.address, value: web3.toWei(4), gas: 150000});
        }, 'Should has an error');

        await sale.finishCrowdsale();
        assert.equal((await token.mintingFinished()), true, 'mintingFinished must true');
    });

    it('finishMinting → test', async () => {
        let end_balance, tokenOnClientWallet, totalSupply;
        let started_balance = (await web3.eth.getBalance(wallet)).toNumber();
        let mintCapInETH = await sale.mintCapInETH();

        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: mintCapInETH, gas: 150000});


        await sale.finishCrowdsale();

        await shouldHaveException(async () => {
            await sale.finishCrowdsale();
        }, 'Should has an error');

        assert.equal((await token.mintingFinished()), true);

        totalSupply = (await token.totalSupply()).toNumber();
        assert.equal(totalSupply, (await sale.hardCapInTokens()).toNumber());

        end_balance = (await web3.eth.getBalance(wallet)).toNumber();
        assert.equal(Math.round((end_balance - started_balance)/1e18), Math.round(mintCapInETH/1e18));

        // token on client wallet
        tokenOnClientWallet = (await token.balanceOf(client1)).toNumber();
        assert.equal(Math.round(((totalSupply/120*100))/1e14), Math.round(tokenOnClientWallet/1e14));

        // token on client wallet
        let tokenOnWallet = (await token.balanceOf(wallet)).toNumber();
        assert.equal(Math.round(((totalSupply/120*20))/1e14), Math.round(tokenOnWallet/1e14));

    });

    it('Transfer → should do something that fires Transfer', async () => {
        let transfers = (await token.Transfer({fromBlock: 0, toBlock: 'latest'}));

        await increaseTime(duration.weeks(1));

        await web3.eth.sendTransaction({from: client1, to: sale.address, value: 2e18, gas: 150000});
        transfers.get((err, events) => {
            assert.equal(events.length, 1);
            assert.equal(events[0].event, 'Transfer');
        });
    });

    it('finishCrowdsale → test onlyOwner', async() => {
        let mintCapInETH = await sale.mintCapInETH();

        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: mintCapInETH, gas: 150000});

        await increaseTime(duration.days(5 * 31 + 1));

        await shouldHaveException(async () => {
            await sale.finishCrowdsale({from: client});
        }, 'Should has an error');

        await sale.finishCrowdsale({from: owner});
    });


    it('setStartTime → set and check', async() => {
        let set_start_time_tlp1 = (await sale.ESetStartTime({fromBlock: 0, toBlock: 'latest'}));

        let time1 = await sale.startTime();
        await sale.setStartTime(startTime + duration.days(1));

        set_start_time_tlp1.get((err, events) => {
            assert.equal(events.length, 1);
            assert.equal(events[0].event, 'ESetStartTime');
        });

        let time2 = await sale.startTime();
        assert.equal(time2-time1, duration.days(1));

        await increaseTime(duration.days(8));

        await shouldHaveException(async () => {
            await sale.setStartTime(time2 + duration.days(1));
        }, 'Should has an error');


    });

    it('setBonusMintingAgent → good owner', async() => {
        let set_fund_minting_events = (await sale.ESetBonusMintingAgent({fromBlock: 0, toBlock: 'latest'}));

        await sale.setBonusMintingAgent(client2);

        set_fund_minting_events.get((err, events) => {
            assert.equal(events.length, 1);
            assert.equal(events[0].event, 'ESetBonusMintingAgent');
        });

    });

    it('setBonusMintingAgent → wrong owner', async() => {
        let set_fund_minting_events = (await sale.ESetBonusMintingAgent({fromBlock: 0, toBlock: 'latest'}));

        await shouldHaveException(async () => {
            await sale.setBonusMintingAgent(client2, {from: client1});
        }, 'Should has an error');

        set_fund_minting_events.get((err, events) => {
            assert.equal(events.length, 0);
        });

    });

    it('bonusMinting → good owner', async() => {
        let mintCapInETH = await sale.mintCapInETH();

        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: bonusMintingAgent, value: 1e18, gas: 150000});
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: mintCapInETH, gas: 150000});


        let token_balance1 = await token.balanceOf(client2);
        await sale.bonusMinting(client2, 10e18, {from: bonusMintingAgent, gas: 150000});
        let token_balance2 = await token.balanceOf(client2);
        assert.equal(token_balance1, 0);
        assert.equal(token_balance2.toNumber(), 10e18);

    });

    it('bonusMinting → test transfer', async () => {
        let mintCapInETH = await sale.mintCapInETH();

        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({
            from: client1,
            to: bonusMintingAgent,
            value: 10e18,
            gas: 150000
        });
        await web3.eth.sendTransaction({
            from: client1,
            to: sale.address,
            value: mintCapInETH,
            gas: 150000
        });

        await sale.bonusMinting(bonusMintingAgent, 10e18, {
            from: bonusMintingAgent,
            gas: 150000
        });
        assert.equal((await token.balanceOf(bonusMintingAgent)).toNumber(), 10e18);
        await token.transfer(client2, 10e18, {from: bonusMintingAgent});
        assert.equal((await token.balanceOf(client2)).toNumber(), 10e18);

        await shouldHaveException(async () => {
            await token.transfer(bonusMintingAgent, 10e18, {
                from: client2
            });
        }, 'Should has an error');
    });

    it('bonusMinting → wrong owner', async() => {
        let mintCapInETH = await sale.mintCapInETH();

        await increaseTime(duration.weeks(1));
        await web3.eth.sendTransaction({from: client1, to: sale.address, value: mintCapInETH, gas: 150000});

        await shouldHaveException(async () => {
            await sale.bonusMinting(client2, 10e18, {from: client1, gas: 150000});
        }, 'Should has an error');
    });

    it('token.mint → forbid minting from wallet or agent', async() => {
        await increaseTime(duration.weeks(1));
        
        await shouldHaveException(async () => {
            await token.mint(client1, 1e18, {from: wallet});
        }, 'Should has an error');

        await shouldHaveException(async () => {
            await token.grant(client1, 1e18, {
                from: wallet
            });
        }, 'Should has an error');
        
    });

});

