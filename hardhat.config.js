require('dotenv').config();
require('@nomiclabs/hardhat-ethers');

const { mnemonic } = require('./secret.json');

module.exports = {
  networks: {
    mumbai: {
      url: process.env.MUMBAI_RPC_URL,
      accounts: { mnemonic: mnemonic },
      chainId: 80001
    },
    hardhat: {
      chainId: 1337
    },
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_APIKEY
  },
  sourcify: {
    enabled: false
  },
  solidity: "0.8.14"
};
