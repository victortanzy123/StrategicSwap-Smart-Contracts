import hre from 'hardhat';

// Deployment Helpers:
import {
  ONE_MILLION_UNITS,
  ONE_THOUSAND_UNITS,
  TEN_MILLION_UNITS,
  TEN_THOUSAND_UNITS,
  deploy,
  getContractAt,
  verifyContract,
} from '../utils/helpers';
// ABI
import {StrategicPoolFactory} from '../../typechain-types';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const FACTORY_CONSTRUCTOR_ARGS = [deployer.address];

  const DAI_ADDRESS = '0x78D91d7B51Eb07FC4B13c514EDDf566C3d12261F';
  const SDAI_VAULT = '0x265677177927A85cf1d3FfFb678D189e66119b09';
  const USDC_ADDRESS = '0x4Ee80e4CA7CdC16540574d7faBe434537d2345b0';
  const FUSDC_VAULT = '0x72c2EE9517664F1A645E808a1FbfCaB4aae68d9C';
  const USDC_DAI_PAIR_POOL_ADDRESS = '0x124d3f000630A23A51e34A402596DB25645E5693';

  const dai = await getContractAt('DAI', DAI_ADDRESS);
  const usdc = await getContractAt('USDC', USDC_ADDRESS);

  const USDC_DAI_PAIR_POOL_ARGS = [FUSDC_VAULT, SDAI_VAULT]; // Based on ordering by `createPair`

  const factory = await deploy<StrategicPoolFactory>(
    deployer,
    'StrategicPoolFactory',
    FACTORY_CONSTRUCTOR_ARGS,
    true,
    'StrategicPoolFactory',
  );
  console.log('Strategic Pool Factory deployed:', factory.address);

  console.log('Creating pair...');
  const createPairTx = await factory.createPair(DAI_ADDRESS, USDC_ADDRESS, SDAI_VAULT, FUSDC_VAULT, true);
  const txReceipt = await createPairTx.wait();
  console.log('DAI/USDC Pair created at transaction hash:', txReceipt.transactionHash);

  const daiUsdcPairPool = await getContractAt('StrategicPoolPairERC4626', USDC_DAI_PAIR_POOL_ADDRESS);
  console.log('Verifying USDC-DAI Strategic Pool Contract...');
  await verifyContract(USDC_DAI_PAIR_POOL_ADDRESS, USDC_DAI_PAIR_POOL_ARGS);
  console.log('Successfully verified!');

  /*
    Nexr steps -> Seed liquidty + perform swaps for frontend integration.
  */

  // 1. Fund both DAI and USDC into the LP's address
  console.log('Funding wallet with both 10,000 DAI and USDC');
  const mintDaiTx = await dai.selfMint(TEN_MILLION_UNITS);
  const mintDaiTxReceipt = await mintDaiTx.wait();
  console.log('Successfully Minted DAI - ', mintDaiTxReceipt.transactionHash);

  const mintUsdcTx = await usdc.selfMint(TEN_MILLION_UNITS);
  const mintUsdcTxReceipt = await mintUsdcTx.wait();
  console.log('Successfully Minted USDC - ', mintUsdcTxReceipt.transactionHash);

  // 2. Seed liquidity to USDC-DAI Strategic Pool
  const approveUsdcForPoolTx = await usdc.approve(USDC_DAI_PAIR_POOL_ADDRESS, TEN_MILLION_UNITS);
  const approveUsdcTxReceipt = await approveUsdcForPoolTx.wait();
  console.log('Approved 10,000,000 USDC for pool pair!', approveUsdcTxReceipt.transactionHash);
  const approveDaiForPoolTx = await dai.approve(USDC_DAI_PAIR_POOL_ADDRESS, TEN_MILLION_UNITS);
  const approveDaiTxReceipt = await approveDaiForPoolTx.wait();
  console.log('Approved 10,000,000 DAI for pool pair!', approveDaiTxReceipt.transactionHash);

  console.log('Depositing liquidity into ERC4626 pool...');
  const lpTx = await daiUsdcPairPool.deposit(deployer.address, ONE_MILLION_UNITS, ONE_MILLION_UNITS);
  const lpTxReceipt = await lpTx.wait();
  console.log('Added liquidity into the pool', lpTxReceipt.transactionHash);

  const reservesData0 = await daiUsdcPairPool.getReserves();
  console.log('BEFORE SWAP - Reserves Data:', reservesData0);

  // 3. Perform a swap on the pool
  const swapUsdcForDaiTx = await daiUsdcPairPool.swap(ONE_THOUSAND_UNITS, USDC_ADDRESS, deployer.address, '0x');
  const swapUsdcForDaiTxReceipt = await swapUsdcForDaiTx.wait();
  console.log('Swapped 1,000 USDC for DAI', swapUsdcForDaiTxReceipt.transactionHash);

  const reservesData1 = await daiUsdcPairPool.getReserves();
  console.log('AFTER SWAP - Reserves Data:', reservesData1);

  // 4. Perform a withdrawal
  const approveLpTokenTx = await daiUsdcPairPool.approve(USDC_DAI_PAIR_POOL_ADDRESS, ONE_MILLION_UNITS);
  const approveLpTokenTxReceipt = await approveLpTokenTx.wait();
  console.log('Approved 10,000,000 LP Token', approveLpTokenTxReceipt.transactionHash);

  const withdrawLiquidityTx = await daiUsdcPairPool.withdraw(deployer.address, TEN_THOUSAND_UNITS);
  const withdrawLiquidityTxReceipt = await withdrawLiquidityTx.wait();
  console.log('Successfully withdrawn 10,000 units of liquidity', withdrawLiquidityTxReceipt.transactionHash);

  const finalReserveData = await daiUsdcPairPool.getReserves();
  console.log('AFTER WITHDRAWAL OF LP - Reserves0 Data:', finalReserveData);

  /*
    Deployment as of 28/01/2024
    
    StrategicSwap Factory:
    https://sepolia.etherscan.io/address/0xDf0655E596aE98CfE7163d81F65847e5e8841B06#code
    Address: 0xDf0655E596aE98CfE7163d81F65847e5e8841B06
    StartBlock: 5168600
  */

  /*
    USDC/DAI Pair Created
    https://sepolia.etherscan.io/address/0x124d3f000630A23A51e34A402596DB25645E5693
    Address: 0x124d3f000630A23A51e34A402596DB25645E5693

    */

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
