import hre from 'hardhat';

// Deployment Helpers:
import {ONE_MILLION_UNITS, deploy, getContractAt, verifyContract} from '../utils/helpers';
// ABI
import {DAI, SavingsDAI, USDC, FluxUSDC} from '../../typechain-types';

const DAI_CONTRACT_PATH = 'contracts/core/dai-savings-rate/DAI.sol:DAI';
const USDC_CONTRACT_PATH = 'contracts/core/flux-usdc/USDC.sol:USDC';
const SAVINGS_DAI_CONTRACT_PATH = 'contracts/core/dai-savings-rate/SavingsDAI.sol:SavingsDAI';
const FLUX_USDC_CONTRACT_PATH = 'contracts/core/flux-usdc/FluxUSDC.sol:FluxUSDC';

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log('Deploying both DAI, Savings DAI, USDC and fUSDC contracts...');
  const dai = await deploy<DAI>(deployer, 'DAI', [], true, 'DAI', DAI_CONTRACT_PATH); // Goerli
  const sDai = await deploy<SavingsDAI>(
    deployer,
    'SavingsDAI',
    [dai.address],
    true,
    'SavingsDAI',
    SAVINGS_DAI_CONTRACT_PATH,
  );

  const usdc = await deploy<USDC>(deployer, 'USDC', [], true, 'USDC', USDC_CONTRACT_PATH); // Goerli
  const fUsdc = await deploy<FluxUSDC>(
    deployer,
    'FluxUSDC',
    [usdc.address],
    true,
    'FluxUSDC',
    FLUX_USDC_CONTRACT_PATH,
  );

  console.log('Minting 1M DAI to SavingsDAI Vault...');
  const mintDaiToSDaiVaultTx = await dai.mintTo(sDai.address, ONE_MILLION_UNITS);
  await mintDaiToSDaiVaultTx.wait();
  console.log('DAI Mint Tx successful!');

  console.log('Minting 1M USDC to FluxUSDC Vault...');
  const mintUsdcToFUsdcVaultTx = await usdc.mintTo(fUsdc.address, ONE_MILLION_UNITS);
  await mintUsdcToFUsdcVaultTx.wait();
  console.log('USDC Mint Tx successful!');
  /*
  Deployment as of 23/01/2024

  DAI ERC20:
  Link: https://sepolia.etherscan.io/address/0x78D91d7B51Eb07FC4B13c514EDDf566C3d12261F#code
  DAI Address: 0x78D91d7B51Eb07FC4B13c514EDDf566C3d12261F

  SAVINGS DAI ERC4626:
  Link: https://sepolia.etherscan.io/address/0x265677177927A85cf1d3FfFb678D189e66119b09#code
  sDAI Address: 0x265677177927A85cf1d3FfFb678D189e66119b09

  USDC ERC20:
  Link: https://sepolia.etherscan.io/address/0x4Ee80e4CA7CdC16540574d7faBe434537d2345b0#code
  USDC Address: 0x4Ee80e4CA7CdC16540574d7faBe434537d2345b0

  FLUX USDC ERC4626:
  Link: https://sepolia.etherscan.io/address/0x72c2EE9517664F1A645E808a1FbfCaB4aae68d9C#code
  fUSDC Address: 0x72c2EE9517664F1A645E808a1FbfCaB4aae68d9C
  */
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
