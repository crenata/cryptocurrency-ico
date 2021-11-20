const BigNumber = web3.BigNumber;
require('chai').use(require('chai-bignumber')(BigNumber)).should();

const DappToken = artifacts.require('DappToken');
contract('DappToken', function(accounts) {
    const _name = "Dapp Token";
    const _symbol = "DAPP";
    const _decimals = 18;

    beforeEach(async function() {
        this.token = await DappToken.new(_name, _symbol, _decimals);
    });

    describe('Token Attributes', function() {
        it('Has the correct name', async function() {
            const name = await this.token.name();
            name.should.equal(_name);
        });
        it('Has the correct symbol', async function() {
            const symbol = await this.token.symbol();
            symbol.should.equal(_symbol);
        });
        it('Has the correct decimals (without "BigNumber" package)', async function() {
            const decimals = await this.token.decimals();
            decimals.toNumber().should.equal(_decimals);
        });
        it('Has the correct decimals (with "BigNumber" package)', async function() {
            const decimals = await this.token.decimals();
            decimals.should.be.bignumber.equal(_decimals);
        });
    });
});