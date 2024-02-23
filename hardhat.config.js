require('dotenv').config();
require('@nomiclabs/hardhat-ethers');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    Sepolia: {
      url: `https://sepolia.infura.io/v3/ccec76206b4e441b99f3f009b73cb3ae`,
      accounts: [process.env.PRIVATE_KEY]
    },

    hardhat: {
      chainId: 1337
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_APIKEY
  },
  sourcify: {
    enabled: false
  },
  solidity: "0.8.14"
};