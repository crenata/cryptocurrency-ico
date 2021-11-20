require('babel-register');
require('babel-polyfill');
require('dotenv').config();
const HDWalletProvider = require('truffle-hdwallet-provider');

module.exports = {
    networks: {
        development: {
            host: "localhost",
            port: 8545,
            network_id: "*"
        },
        ganache: {
            host: "localhost",
            port: 8545,
            network_id: "*"
        },
        ropsten: {
            provider: () => new HDWalletProvider(process.env.MNEMONIC, `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`),
            network_id: 3
        }
    },
    solc: {
        optimizer: {
            enabled: true,
            runs: 200
        }
    },
    plugins: [
        "truffle-plugin-verify"
    ],
    api_keys: {
        etherscan: process.env.ETHERSCAN_API_KEY
    }
};