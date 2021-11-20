import ether from "./helpers/ether";
import EVMRevert from "./helpers/EVMRevert";
import {increaseTimeTo, duration} from "./helpers/increaseTime";
import latestTime from "./helpers/latestTime";

const BigNumber = web3.BigNumber;
require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const DappToken = artifacts.require('DappToken');
const DappTokenCrowdsale = artifacts.require('DappTokenCrowdsale');
const RefundVault = artifacts.require('RefundVault');
const TokenTimelock = artifacts.require('TokenTimelock');
contract('DappTokenCrowdsale', function([_, wallet, investor1, investor2, foundersFund, foundationFund, partnersFund]) {
    before(async function() {
        // Transfer extra ether to investor1's account for testing
        await web3.eth.sendTransaction({
            from: _,
            to: investor1,
            value: ether(25)
        });
    });

    beforeEach(async function() {
        // Token config
        this.name = "DappToken";
        this.symbol = "DAPP";
        this.decimals = 18;

        // Token Deploy
        this.token = await DappToken.new(this.name, this.symbol, this.decimals);

        // Crowsale Config
        this.rate = 500;
        this.wallet = wallet;
        this.cap = ether(100);
        this.openingTime = latestTime() + duration.weeks(1);
        this.closingTime = this.openingTime + duration.weeks(1);
        this.goal = ether(50);
        this.foundersFund = foundersFund;
        this.foundationFund = foundationFund;
        this.partnersFund = partnersFund;
        this.releaseTime = this.closingTime + duration.years(1);

        // Investor Caps
        this.investorMinCap = ether(0.002);
        this.investorHardCap = ether(50);

        // ICO Stages
        this.preIcoStage = 0;
        this.preIcoRate = 500;
        this.icoStage = 1;
        this.icoRate = 250;

        // Token Distribution
        this.tokenSalePercentage = 70;
        this.foundersPercentage = 10;
        this.foundationPercentage = 10;
        this.partnersPercentage = 10;

        this.crowdsale = await DappTokenCrowdsale.new(
            this.rate,
            this.wallet,
            this.token.address,
            this.cap,
            this.openingTime,
            this.closingTime,
            this.goal,
            this.foundersFund,
            this.foundationFund,
            this.partnersFund,
            this.releaseTime
        );

        // Pause token
        await this.token.pause();

        // Transfer Token Ownership to Crowdsale
        await this.token.transferOwnership(this.crowdsale.address);

        // Add investor to whitelist
        await this.crowdsale.addManyToWhitelist([investor1, investor2]);

        // Track refund vault
        this.vaultAddress = await this.crowdsale.vault();
        this.vault = RefundVault.at(this.vaultAddress);

        // Advance time to crowdsale start
        await increaseTimeTo(this.openingTime + 1);
    });

    describe('Crowdsale', function() {
        it('Track the rate', async function() {
            const rate = await this.crowdsale.rate();
            rate.should.be.bignumber.equal(this.rate);
        });
        it('Track the wallet', async function() {
            const wallet = await this.crowdsale.wallet();
            wallet.should.equal(this.wallet);
        });
        it('Track the token', async function() {
            const token = await this.crowdsale.token();
            token.should.equal(this.token.address);
        });
    });

    describe('Minted Crowdsale', function() {
        it('Mints tokens after purchase', async function() {
            const originalTotalSupply = await this.token.totalSupply();
            await this.crowdsale.sendTransaction({
                value: ether(1),
                from: investor1
            });
            const newTotalSupply = await this.token.totalSupply();
            assert.isTrue(newTotalSupply > originalTotalSupply);
        });
    });

    describe('Capped Crowdsale', function() {
        it('Has the correct hard cap', async function() {
            const cap = await this.crowdsale.cap();
            cap.should.be.bignumber.equal(this.cap);
        });
    });

    describe('Timed Crowdsale', function() {
        it('Is open', async function() {
            const isClosed = await this.crowdsale.hasClosed();
            isClosed.should.be.false;
        });
    });

    describe('Whitelisted Crowdsale', function() {
        it('Rejects contributions from non-whitelisted investors', async function() {
            const notWhitelisted = _;
            await this.crowdsale.buyTokens(notWhitelisted, {
                value: ether(1),
                from: notWhitelisted
            }).should.be.rejectedWith(EVMRevert);
        });
        it('Allows contributions from whitelisted investors', async function() {
            await this.crowdsale.buyTokens(investor1, {
                value: ether(1),
                from: investor1
            }).should.be.fulfilled;
        });
    });

    describe('Refundable Crowdsale', function() {
        describe('During crowdsale', function() {
            beforeEach(async function() {
                await this.crowdsale.buyTokens(investor1, {
                    value: ether(1),
                    from: investor1
                });
            });
            it('Prevents the investor from claiming refund', async function() {
                await this.vault.refund(investor1, {
                    from: investor1
                }).should.be.rejectedWith(EVMRevert);
            });
            describe('When the crowdsale stage is pre-ICO', function() {
                beforeEach(async function() {
                    await this.crowdsale.buyTokens(investor1, {
                        value: ether(1),
                        from: investor1
                    });
                });
                it('Forwards funds to the wallet', async function() {
                    const balance = await web3.eth.getBalance(this.wallet);
                    expect(balance.toNumber()).to.be.above(ether(100).toNumber());
                });
            });
            describe('When the crowdsale stage is ICO', function() {
                beforeEach(async function() {
                    await this.crowdsale.setCrowdsaleStage(this.icoStage, {
                        from: _
                    });
                    await this.crowdsale.buyTokens(investor1, {
                        value: ether(1),
                        from: investor1
                    });
                });
                it('Forwards funds to the refund vault', async function() {
                    const balance = await web3.eth.getBalance(this.vaultAddress);
                    expect(balance.toNumber()).to.be.above(0);
                });
            });
        });
    });

    describe('Crowdsale Stages', function() {
        it('It starts in pre-ICO', async function() {
            const stage = await this.crowdsale.stage();
            stage.should.be.bignumber.equal(this.preIcoStage);
        });
        it('Starts at the pre-ICO rate', async function() {
            const rate = await this.crowdsale.rate();
            rate.should.be.bignumber.equal(this.preIcoRate);
        });
        it('Allows admin to update the stage & rate', async function() {
            await this.crowdsale.setCrowdsaleStage(this.icoStage, {
                from: _
            });
            const stage = await this.crowdsale.stage();
            stage.should.be.bignumber.equal(this.icoStage);
            const rate = await this.crowdsale.rate();
            rate.should.be.bignumber.equal(this.icoRate);
        });
        it('Prevents non-admin from updating the stage', async function() {
            await this.crowdsale.setCrowdsaleStage(this.icoStage, {
                from: investor1
            }).should.be.rejectedWith(EVMRevert);
        });
    });

    describe('Accepting Payments', function() {
        it('Should accept payment', async function() {
            const value = ether(1);
            const purchaser = investor2;
            await this.crowdsale.sendTransaction({
                value: value,
                from: investor1
            }).should.be.fulfilled;
            await this.crowdsale.buyTokens(investor1, {
                value: value,
                from: purchaser
            }).should.be.fulfilled;
        });
    });

    describe('Buy Tokens', function() {
        describe('When the contribution < the minimum cap', function() {
            it('Rejects the transaction', async function() {
                const value = this.investorMinCap - 1;
                await this.crowdsale.buyTokens(investor2, {
                    value: value,
                    from: investor2
                }).should.be.rejectedWith(EVMRevert);
            });
        });
        describe('When the investor has already met the minimum cap', function() {
            it('Allows the investor to contribute below the minimum cap', async function() {
                // First contribution is valid
                const value1 = ether(1);
                await this.crowdsale.buyTokens(investor1, {
                    value: value1,
                    from: investor1
                });
                // Second contribution is less than investor cap
                const value2 = 1; // wei
                await this.crowdsale.buyTokens(investor1, {
                    value: value2,
                    from: investor1
                }).should.be.fulfilled;
            });
        });
        describe('When the total contributions exceed the investor hard cap', function() {
            it('Rejects the transaction', async function() {
                // First contribution is in valid range
                const value1 = ether(2);
                await this.crowdsale.buyTokens(investor1, {
                    value: value1,
                    from: investor1
                });
                // Second contribution sends total contributions over investor hard cap
                const value2 = ether(49);
                await this.crowdsale.buyTokens(investor1, {
                    value: value2,
                    from: investor1
                }).should.be.rejectedWith(EVMRevert);
            });
        });
        describe('When the contribution is within the valid range', function() {
            const value = ether(2);
            it('Succeeds & Updates the contribution amount', async function() {
                await this.crowdsale.buyTokens(investor2, {
                    value: value,
                    from: investor2
                }).should.be.fulfilled;
                const contribution = await this.crowdsale.getUserContribution(investor2);
                contribution.should.be.bignumber.equal(value);
            });
        });
    });

    describe('Token Transfers', function() {
        it('Does not allow investors to transfers tokens during crowdsale', async function() {
            await this.crowdsale.buyTokens(investor1, {
                value: ether(1),
                from: investor1
            });
            await this.token.transfer(investor2, 1, {
                from: investor1
            }).should.be.rejectedWith(EVMRevert);
        });
    });

    describe('Finalizing The Crowdsale', function() {
        describe('When the goal is not reached', function() {
            beforeEach(async function() {
                // Don't meet the toal
                await this.crowdsale.buyTokens(investor2, {
                    value: ether(1),
                    from: investor2
                });
                // Fast forward past end time
                await increaseTimeTo(this.closingTime + 1);
                // Finalize the crowdsale
                await this.crowdsale.finalize({
                    from: _
                });
            });
            it('Allows the investor to claim refund', async function() {
                await this.vault.refund(investor2, {
                    from: investor2
                }).should.be.fulfilled;
            });
        });
        describe('When the goal is reached', function() {
            beforeEach(async function() {
                // Track current wallet balance
                this.walletBalance = await web3.eth.getBalance(wallet);
                // Meet the goal
                await this.crowdsale.buyTokens(investor1, {
                    value: ether(26),
                    from: investor1
                });
                await this.crowdsale.buyTokens(investor2, {
                    value: ether(26),
                    from: investor2
                });
                // Fast forward past end time
                await increaseTimeTo(this.closingTime + 1);
                // Finalize the crowdsale
                await this.crowdsale.finalize({
                    from: _
                });
            });
            it('Handles goal reached', async function() {
                // Track goal reached
                const goalReached = await this.crowdsale.goalReached();
                goalReached.should.be.true;

                // Finish minting token
                const mintingFinished = await this.token.mintingFinished();
                mintingFinished.should.be.true;

                // Unpause the token
                const paused = await this.token.paused();
                paused.should.be.false;

                // Enables token transfers
                await this.token.transfer(investor2, 1, {
                    from: investor1
                }).should.be.fulfilled;

                // Founders
                const foundersTimelockAddress = await this.crowdsale.foundersTimelock();
                let foundersAmount = fundsAmount(this.token, this.decimals, foundersTimelockAddress, this.foundersPercentage);
                let foundersTimelockBalance = balance(this.token, this.decimals, foundersTimelockAddress);
                assert.equal(foundersTimelockBalance.toString(), foundersAmount.toString());
                // Foundation
                const foundationTimelockAddress = await this.crowdsale.foundationTimelock();
                let foundationAmount = fundsAmount(this.token, this.decimals, foundationTimelockAddress, this.foundationPercentage);
                let foundationTimelockBalance = balance(this.token, this.decimals, foundationTimelockAddress);
                assert.equal(foundationTimelockBalance.toString(), foundationAmount.toString());
                // Partners
                const partnersTimelockAddress = await this.crowdsale.partnersTimelock();
                let partnersAmount = fundsAmount(this.token, this.decimals, partnersTimelockAddress, this.partnersPercentage);
                let partnersTimelockBalance = balance(this.token, this.decimals, partnersTimelockAddress);
                assert.equal(partnersTimelockBalance.toString(), partnersAmount.toString());

                // Can't withdraw from timelocks
                const foundersTimelock = await TokenTimelock.at(foundersTimelockAddress);
                await foundersTimelock.release().should.be.rejectedWith(EVMRevert);
                const foundationTimelock = await TokenTimelock.at(foundationTimelockAddress);
                await foundationTimelock.release().should.be.rejectedWith(EVMRevert);
                const partnersTimelock = await TokenTimelock.at(partnersTimelockAddress);
                await partnersTimelock.release().should.be.rejectedWith(EVMRevert);

                // Can withdraw
                await increaseTimeTo(this.releaseTime + 1);
                await foundersTimelock.release().should.be.fulfilled;
                await foundationTimelock.release().should.be.fulfilled;
                await partnersTimelock.release().should.be.fulfilled;

                // Funds now have balances
                let foundersBalance = balance(this.token, this.decimals, this.foundersFund);
                assert.equal(foundersBalance.toString(), foundersAmount.toString());
                let foundationBalance = balance(this.token, this.decimals, this.foundationFund);
                assert.equal(foundationBalance.toString(), foundationAmount.toString());
                let partnersBalance = balance(this.token, this.decimals, this.partnersFund);
                assert.equal(partnersBalance.toString(), partnersAmount.toString());

                // Transfer ownership to the wallet
                const owner = await this.token.owner();
                owner.should.be.equal(this.wallet);

                // Prevents investor from claiming refund
                await this.vault.refund(investor1, {
                    from: investor1
                }).should.be.rejectedWith(EVMRevert);
            });
        });
    });

    describe('Token Distribution', function() {
        it('Tracks token distribution correctly', async function() {
            const tokenSalePercentage = await this.crowdsale.tokenSalePercentage();
            tokenSalePercentage.should.be.bignumber.eq(this.tokenSalePercentage, "Has correct tokenSalePercentage");
            const foundersPercentage = await this.crowdsale.foundersPercentage();
            foundersPercentage.should.be.bignumber.eq(this.foundersPercentage, "Has correct foundersPercentage");
            const foundationPercentage = await this.crowdsale.foundationPercentage();
            foundationPercentage.should.be.bignumber.eq(this.foundationPercentage, "Has correct foundationPercentage");
            const partnersPercentage = await this.crowdsale.partnersPercentage();
            partnersPercentage.should.be.bignumber.eq(this.partnersPercentage, "Has correct partnersPercentage");
        });
        it('Is a valid percentage breakdown', async function() {
            const tokenSalePercentage = await this.crowdsale.tokenSalePercentage();
            const foundersPercentage = await this.crowdsale.foundersPercentage();
            const foundationPercentage = await this.crowdsale.foundationPercentage();
            const partnersPercentage = await this.crowdsale.partnersPercentage();
            const total = tokenSalePercentage.toNumber() + foundersPercentage.toNumber() + foundationPercentage.toNumber() + partnersPercentage.toNumber();
            total.should.be.equal(100);
        });
    });

    async function fundsAmount(token, decimals, timelockAddress, percentage) {
        let totalSupply = await token.totalSupply();
        totalSupply = totalSupply.toString();
        let amount = totalSupply / percentage;
        amount = amount.toString();
        amount = amount / (10 ** decimals);
        return amount;
    }
    async function balance(token, decimals, address) {
        let balance = await token.balanceOf(address);
        balance = balance.toString();
        balance = balance / (10 ** decimals);
        return balance;
    }
});