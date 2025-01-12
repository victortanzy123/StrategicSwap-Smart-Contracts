import * as dotenv from 'dotenv';

import {HardhatUserConfig} from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-ethers';
// import '@nomiclabs/hardhat-waffle';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'hardhat-contract-sizer';
import 'solidity-coverage';

dotenv.config();
const dummyPrivateKey = '1111111111111111111111111111111111111111111111111111111111111111';

const config: HardhatUserConfig = {
  paths: {
    sources: './contracts',
    tests: './test',
    artifacts: './build/artifacts',
    cache: './build/cache',
  },
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 0,
          },
        },
      },
    ],
  },
  contractSizer: {
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
    only: [],
  },
  networks: {
    hardhat: {
      chainId: 1313161554,
      forking: {
        // url: `https://testnet.aurora.dev/${process.env.AURORA_API_KEY}`,
        url: `https://api.avax.network/ext/bc/C/rpc`,
        // blockNumber: 65217137
      },
      accounts: [
        // 5 accounts with 10^14 ETH each
        // Addresses:
        //   your address generated from the private key
        //   0x6824c889f6EbBA8Dac4Dd4289746FCFaC772Ea56
        //   0xCFf94465bd20C91C86b0c41e385052e61ed49f37
        //   0xEBAf3e0b7dBB0Eb41d66875Dd64d9F0F314651B3
        //   0xbFe6D5155040803CeB12a73F8f3763C26dd64a92
        // {
        //   privateKey: `${process.env.PRIVATE_KEY}`,
        //   balance: '1000000000000000000000000000000000000',
        // },
        {
          privateKey: '0xca3547a47684862274b476b689f951fad53219fbde79f66c9394e30f1f0b4904',
          balance: '1000000000000000000000000000000000000',
        },
        {
          privateKey: '0x4bad9ef34aa208258e3d5723700f38a7e10a6bca6af78398da61e534be792ea8',
          balance: '1000000000000000000000000000000000000',
        },
        {
          privateKey: '0xffc03a3bd5f36131164ad24616d6cde59a0cfef48235dd8b06529fc0e7d91f7c',
          balance: '1000000000000000000000000000000000000',
        },
        {
          privateKey: '0x380c430a9b8fa9cce5524626d25a942fab0f26801d30bfd41d752be9ba74bd98',
          balance: '1000000000000000000000000000000000000',
        },
        {
          privateKey: '0x380c430a9b8fa9cce5524626d25a942fab0f26801d30bfd41d752be9ba74bd99',
          balance: '1000000000000000000000000000000000000',
        },
      ],
      allowUnlimitedContractSize: true,
      blockGasLimit: 800000000000000,
      gas: 80000000,
      loggingEnabled: false,
    },
    avax: {
      url: `https://api.avax.network/ext/bc/C/rpc`,
      accounts: [`${process.env.PRIVATE_KEY || dummyPrivateKey}`],
      gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
    'base-goerli': {
      url: 'https://goerli.base.org',
      accounts: [`${process.env.PRIVATE_KEY_BASE_GOERLI || dummyPrivateKey}`],
      gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
    linea_testnet: {
      url: 'https://rpc.goerli.linea.build',
      accounts: [`${process.env.PRIVATE_KEY_727 || dummyPrivateKey}`],
      timeout: 200000,
    },
    'mantle-testnet': {
      url: 'https://rpc.testnet.mantle.xyz',
      accounts: [`${process.env.PRIVATE_KEY_727 || dummyPrivateKey}`],
      timeout: 200000,
    },
    bsc: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts: [`${process.env.PRIVATE_KEY_BSC || dummyPrivateKey}`],
      gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
    polygon: {
      url: `https://polygon-rpc.com`,
      accounts: [`${process.env.PRIVATE_KEY || dummyPrivateKey}`],
      gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [`${process.env.PRIVATE_KEY_727 || dummyPrivateKey}`],
      // gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [`${process.env.PRIVATE_KEY_727 || dummyPrivateKey}`],
      // gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
    bscTestnet: {
      url: `https://data-seed-prebsc-1-s2.binance.org:8545`,
      accounts: [`${(process.env.PRIVATE_KEY_727 as string) || dummyPrivateKey}`],
      // gasPrice: 30 * 1000000000,
      timeout: 200000,
    },
  },
  typechain: {
    target: 'ethers-v5',
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  mocha: {
    timeout: 500000,
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    // apiKey: process.env.SNOWTRACE_KEY,
    apiKey: {
      rinkeby: process.env.ETHERSCAN_API_KEY || '',
      goerli: process.env.ETHERSCAN_API_KEY || '',
      'base-goerli': 'PLACEHOLDER_STRING',
      linea_testnet: process.env.LINEASCAN_API_KEY || '',
      'mantle-testnet': 'PLACEHOLDER_STRING',
      sepolia: process.env.ETHERSCAN_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      bscTestnet: process.env.BSCSCAN_API_KEY || '',
      polygon: process.env.POLYGONSCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'base-goerli',
        chainId: 84531,
        urls: {
          apiURL: 'https://api-goerli.basescan.org/api',
          browserURL: 'https://goerli.basescan.org',
        },
      },
      {
        network: 'linea_testnet',
        chainId: 59140,
        urls: {
          apiURL: 'https://api-testnet.lineascan.build/api',
          browserURL: 'https://goerli.lineascan.build/address',
        },
      },
    ],
  },
};

export default config;
