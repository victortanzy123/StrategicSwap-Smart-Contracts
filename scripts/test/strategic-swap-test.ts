import {
  DAI,
  SavingsDAI,
  USDC,
  FluxUSDC,
  StrategicPoolFactory,
  StrategicPoolPairERC4626__factory,
} from '../../typechain-types';

import {deploy, getContractAt, toWei} from '../utils/hardhat-helpers';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {expect} from 'chai';
import {BigNumber, Contract} from 'ethers';
import {ethers, network} from 'hardhat';
import {DEFAULT_DECIMALS, ZERO_BN} from '../utils/const';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {
  ONE_HUNDRED,
  ONE_THOUSAND,
  ONE_HUNDRED_UNITS,
  ONE_THOUSAND_UNITS,
  ONE_YEAR,
  fastForwardTime,
  ONE_UNIT,
  ONE_WEEK,
  TEN_THOUSAND_UNITS,
} from '../utils/helpers';

async function mintTokensToAddresses(
  tokens: string[],
  abiTypes: string[],
  users: SignerWithAddress[],
  amount: number = 10000,
) {
  for (let i = 0; i < tokens.length; i++) {
    console.log('SEE INPUT', abiTypes[i], tokens[i]);
    let TOKEN_CONTRACT = await getContractAt(abiTypes[i], tokens[i]);

    console.log(`Minting ${i + 1} (${abiTypes[i]}) out of ${tokens.length} tokens...`);
    for (let j = 0; j < users.length; j++) {
      const VALUE = ethers.utils.parseUnits(amount.toString(), 'ether');
      const MINT_TX = await TOKEN_CONTRACT.connect(users[j]).selfMint(VALUE);
    }
  }
  console.log('Minting to all users have been successfully completed!');
}

describe('StrategicSwap Testing Script', function () {
  async function deployFixture() {
    const [owner, liquidityProvider1, liquidityProvider2, trader, FEE_RECEIVER, _] = await ethers.getSigners();

    // Deploy all Respective ancillary yield contracts

    // DAI Savings Rate
    const DAI_CONTRACT = await deploy<DAI>('DAI', []);
    const SDAI_CONTRACT = await deploy<SavingsDAI>('SavingsDAI', [DAI_CONTRACT.address]);

    // Flux USDC
    const USDC_CONTRACT = await deploy<USDC>('USDC', []);
    const FUSDC_CONTRACT = await deploy<FluxUSDC>('FluxUSDC', [USDC_CONTRACT.address]);

    // Mint 10,000 units of DAI to `liquidityProvider1`, `liquidityProvider2`, `trader`
    await mintTokensToAddresses(
      [DAI_CONTRACT.address, USDC_CONTRACT.address],
      ['DAI', 'USDC'],
      [liquidityProvider1, liquidityProvider2, trader],
    );

    // Mint additional supply to the yield-bearing contracts for yield disbursement over time
    await DAI_CONTRACT.mintTo(SDAI_CONTRACT.address, TEN_THOUSAND_UNITS);
    await USDC_CONTRACT.mintTo(FUSDC_CONTRACT.address, TEN_THOUSAND_UNITS);

    // Pool Factory
    const POOL_FACTORY_CONTRACT = await deploy<StrategicPoolFactory>('StrategicPoolFactory', [FEE_RECEIVER.address]);

    // Deploy DAI-USDC Strategic Pool
    const DAI_USDC_POOL_CREATION_TX = await POOL_FACTORY_CONTRACT.connect(owner).createPair(
      DAI_CONTRACT.address,
      USDC_CONTRACT.address,
      SDAI_CONTRACT.address,
      FUSDC_CONTRACT.address,
      true,
    );

    const DAI_USDC_POOL_ADDRESS = await POOL_FACTORY_CONTRACT.getPair(DAI_CONTRACT.address, USDC_CONTRACT.address);
    const DAI_USDC_POOL_CONTRACT = StrategicPoolPairERC4626__factory.connect(DAI_USDC_POOL_ADDRESS, owner);

    return {
      owner,
      liquidityProvider1,
      liquidityProvider2,
      trader,
      FEE_RECEIVER,
      DAI_CONTRACT,
      SDAI_CONTRACT,
      USDC_CONTRACT,
      FUSDC_CONTRACT,
      POOL_FACTORY_CONTRACT,
      DAI_USDC_POOL_CONTRACT,
    };
  }

  describe('[Savings DAI & Flux USDC ERC-4626 Vault Initialisation]', function () {
    it('should display the appropriate increasing exchange rate for ERC-4626 Vaults', async function () {
      const {SDAI_CONTRACT, FUSDC_CONTRACT} = await loadFixture(deployFixture);

      const SDAI_APR = await SDAI_CONTRACT.INTEREST_BPS();
      const FUSDC_APR = await FUSDC_CONTRACT.INTEREST_BPS();

      let INITIAL_SDAI_EXCHANGE_RATE = await SDAI_CONTRACT.exchangeRate();
      let INITIAL_FUSDC_EXCHANGE_RATE = await FUSDC_CONTRACT.exchangeRate();
      // console.log(
      //   'SEE EXCHANGE RATE BEFORE:',
      //   INITIAL_SDAI_EXCHANGE_RATE.toString(),
      //   INITIAL_FUSDC_EXCHANGE_RATE.toString(),
      // );

      // Fast forward by a year -> 5% APR
      await fastForwardTime(ONE_YEAR);

      const ONE_YEAR_SDAI_EXCHANGE_RATE = await SDAI_CONTRACT.exchangeRate();
      const ONE_YEAR_FUSDC_EXCHANGE_RATE = await FUSDC_CONTRACT.exchangeRate();
      // console.log(
      //   'SEE EXCHANGE RATE AFTER:',
      //   ONE_YEAR_SDAI_EXCHANGE_RATE.toString(),
      //   ONE_YEAR_FUSDC_EXCHANGE_RATE.toString(),
      // );

      expect(SDAI_APR.toString()).to.be.equal(ONE_YEAR_SDAI_EXCHANGE_RATE.sub(INITIAL_SDAI_EXCHANGE_RATE).toString());
      expect(FUSDC_APR.toString()).to.be.equal(
        ONE_YEAR_FUSDC_EXCHANGE_RATE.sub(INITIAL_FUSDC_EXCHANGE_RATE).toString(),
      );
    });
  });

  describe('[SET_UP-1 Deployment of DAI-USDC Strategic Pool]', function () {
    it('should be able to deploy a strategic ERC4626-Vault Pool (DAI-USDC)', async function () {
      const {
        owner,
        FEE_RECEIVER,
        DAI_CONTRACT,
        USDC_CONTRACT,
        SDAI_CONTRACT,
        FUSDC_CONTRACT,
        POOL_FACTORY_CONTRACT,
        DAI_USDC_POOL_CONTRACT,
      } = await loadFixture(deployFixture);

      const DAI_USDC_POOL_ADDRESS = DAI_USDC_POOL_CONTRACT.address;
      // Instantiate Created Pool Contract
      const POOL_CONTRACT = StrategicPoolPairERC4626__factory.connect(DAI_USDC_POOL_ADDRESS, owner);

      expect(await POOL_FACTORY_CONTRACT.FEE_RECEIVER()).to.be.equal(FEE_RECEIVER.address);
      expect(POOL_CONTRACT.address).to.be.equal(DAI_USDC_POOL_ADDRESS);

      const POOL_MODE = await POOL_CONTRACT.stableSwapMode();
      expect(POOL_MODE).to.be.equal(true);

      const REGISTERED_POOL_FACTORY = await POOL_CONTRACT.factory();
      expect(REGISTERED_POOL_FACTORY).to.be.equal(POOL_FACTORY_CONTRACT.address);

      const SORTED_TOKEN_0_ADDRESS =
        DAI_CONTRACT.address < USDC_CONTRACT.address ? DAI_CONTRACT.address : USDC_CONTRACT.address;
      const SORTED_TOKEN_1_ADDRESS =
        SORTED_TOKEN_0_ADDRESS === DAI_CONTRACT.address ? USDC_CONTRACT.address : DAI_CONTRACT.address;
      const SORTED_VAULT_TOKEN_0_ADDRESS =
        SORTED_TOKEN_0_ADDRESS === DAI_CONTRACT.address ? SDAI_CONTRACT.address : FUSDC_CONTRACT.address;
      const SORTED_VAULT_TOKEN_1_ADDRESS =
        SORTED_TOKEN_0_ADDRESS === SDAI_CONTRACT.address ? FUSDC_CONTRACT.address : SDAI_CONTRACT.address;

      const TOKEN_0_ADDRESS = await POOL_CONTRACT.token0();
      expect(TOKEN_0_ADDRESS).to.be.equal(SORTED_TOKEN_0_ADDRESS);

      const TOKEN_1_ADDRESS = await POOL_CONTRACT.token1();
      expect(TOKEN_1_ADDRESS).to.be.equal(SORTED_TOKEN_1_ADDRESS);

      const [reserve0, reserve1, token0FeePercent, token1FeePercent] = await POOL_CONTRACT.getReserves();
      expect(reserve0.toString()).to.be.equal(ZERO_BN.toString());
      expect(reserve1.toString()).to.be.equal(ZERO_BN.toString());
      expect(token0FeePercent).to.be.equal(300);
      expect(token1FeePercent).to.be.equal(300);
      // console.log('SEE HERE', reserve0, reserve1, token0FeePercent, token1FeePercent);

      const ASSET_STRATEGY_0 = await POOL_CONTRACT.assetStrategyList(0);
      const [UNDERLYING_TOKEN_0, YIELD_TOKEN_0] = ASSET_STRATEGY_0;
      expect(UNDERLYING_TOKEN_0).to.be.equal(SORTED_TOKEN_0_ADDRESS);
      expect(YIELD_TOKEN_0).to.be.equal(SORTED_VAULT_TOKEN_0_ADDRESS);

      const ASSET_STRATEGY_1 = await POOL_CONTRACT.assetStrategyList(1);
      const [UNDERLYING_TOKEN_1, YIELD_TOKEN_1] = ASSET_STRATEGY_1;
      expect(UNDERLYING_TOKEN_1).to.be.equal(SORTED_TOKEN_1_ADDRESS);
      expect(YIELD_TOKEN_1).to.be.equal(SORTED_VAULT_TOKEN_1_ADDRESS);

      const ASSET_STRATEGIES = await POOL_CONTRACT.assetStrategiesLength();
      // console.log('SEE ASSET STRATEGY 0 ', ASSET_STRATEGY_0);
      expect(ASSET_STRATEGIES.toString()).to.be.equal('2');
    });
  });

  describe('[LP-1 Liquidity Provision & Minting of LP Token]', function () {
    it('should be able to allow LP to provide liquidity and mint LP Token.', async function () {
      const {liquidityProvider1, DAI_CONTRACT, USDC_CONTRACT, DAI_USDC_POOL_CONTRACT} = await loadFixture(
        deployFixture,
      );

      // Query balance of `liquidityProvider1`
      const DAI_BALANCE_LP1_BEFORE = await DAI_CONTRACT.balanceOf(liquidityProvider1.address);
      const USDC_BALANCE_LP1_BEFORE = await USDC_CONTRACT.balanceOf(liquidityProvider1.address);
      // console.log('SEE BALANCE: ', DAI_BALANCE_LP1_BEFORE, USDC_BALANCE_LP1_BEFORE);

      // Set Approval for contract to transfer on `liquidityProvider1`'s behalf
      await DAI_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);
      await USDC_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);

      // DEPOSIT liquidity to pool contract
      const LP1_DEPOSIT_TX = await DAI_USDC_POOL_CONTRACT.connect(liquidityProvider1).deposit(
        liquidityProvider1.address,
        ONE_THOUSAND_UNITS,
        ONE_THOUSAND_UNITS,
      );
      // console.log('SEE DEPOSIT TX', LP1_DEPOSIT_TX);

      // Check Balance
      const DAI_BALANCE_LP1_AFTER = await DAI_CONTRACT.balanceOf(liquidityProvider1.address);
      const USDC_BALANCE_LP1_AFTER = await USDC_CONTRACT.balanceOf(liquidityProvider1.address);
      // console.log('SEE BALANCES AFTER', DAI_BALANCE_LP1_AFTER.toString(), USDC_BALANCE_LP1_AFTER.toString());
      expect(DAI_BALANCE_LP1_AFTER.toString()).to.be.equal(DAI_BALANCE_LP1_BEFORE.sub(ONE_THOUSAND_UNITS).toString());
      expect(USDC_BALANCE_LP1_AFTER.toString()).to.be.equal(
        USDC_BALANCE_LP1_BEFORE.sub(ONE_THOUSAND_UNITS).toString(),
      );

      const LP1_LIQUIDITY = await DAI_USDC_POOL_CONTRACT.balanceOf(liquidityProvider1.address);
      const expectedBaseLiquidityInt = (ONE_THOUSAND * ONE_THOUSAND) ** 0.5; // sqrt((amount0 * amount1))
      const EXPECTED_LP1_LIQUIDITY = toWei(expectedBaseLiquidityInt, DEFAULT_DECIMALS).sub(ONE_THOUSAND); // minus 1000 liquidity for locking away
      expect(LP1_LIQUIDITY.toString()).to.be.equal(EXPECTED_LP1_LIQUIDITY.toString());
      // console.log('SEE', LP1_LIQUIDITY, EXPECTED_LP1_LIQUIDITY.toString());

      // WITHDRAWAL OF LIQUIDITY
      // Set approval for pool contract to transfer on `liquidityProvider1` behalf:
      await DAI_USDC_POOL_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, LP1_LIQUIDITY);

      // Withdraw Liquidity -> burn LP token to receive respective liquidity of tokens
      const LP1_WITHDRAWAL_TX = await DAI_USDC_POOL_CONTRACT.connect(liquidityProvider1).withdraw(
        liquidityProvider1.address,
        LP1_LIQUIDITY,
      );
      const DAI_BALANCE_LP1_AFTER_WITHDRAWAL = await DAI_CONTRACT.balanceOf(liquidityProvider1.address);
      const DAI_RECEIVED = DAI_BALANCE_LP1_AFTER_WITHDRAWAL.sub(DAI_BALANCE_LP1_AFTER);

      const USDC_BALANCE_LP1_AFTER_WITHDRAWAL = await USDC_CONTRACT.balanceOf(liquidityProvider1.address);
      const USDC_RECEIVED = USDC_BALANCE_LP1_AFTER_WITHDRAWAL.sub(USDC_BALANCE_LP1_AFTER);
      // console.log('SEE BALANCE AFTER WITHDRAWAL', DAI_BALANCE_LP1_AFTER_WITHDRAWAL, USDC_BALANCE_LP1_AFTER_WITHDRAWAL);
      expect(DAI_RECEIVED.toString()).to.be.equal(ONE_THOUSAND_UNITS.sub(1000).toString());
      expect(USDC_RECEIVED.toString()).to.be.equal(ONE_THOUSAND_UNITS.sub(1000).toString());
    });
  });

  describe('[T-1 Token Swap - USDC for DAI]', function () {
    it('should be able swap one token for the other', async function () {
      const {
        liquidityProvider1,
        trader,
        DAI_CONTRACT,
        USDC_CONTRACT,
        SDAI_CONTRACT,
        FUSDC_CONTRACT,
        DAI_USDC_POOL_CONTRACT,
      } = await loadFixture(deployFixture);

      // Set Approval for contract to transfer on `liquidityProvider1`'s behalf
      await DAI_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);
      await USDC_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);

      // DEPOSIT liquidity to pool contract
      const LP1_DEPOSIT_TX = await DAI_USDC_POOL_CONTRACT.connect(liquidityProvider1).deposit(
        liquidityProvider1.address,
        ONE_THOUSAND_UNITS,
        ONE_THOUSAND_UNITS,
      );
      // console.log('SEE DEPOSIT TX', LP1_DEPOSIT_TX);
      let SDAI_BALANCE = await SDAI_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      let FUSDC_BALANCE = await FUSDC_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      // console.log('See balances of SHARES BEFORE:', SDAI_BALANCE.toString(), FUSDC_BALANCE.toString());
      // Query balances of `trader`
      const DAI_BALANCE_LP1_BEFORE = await DAI_CONTRACT.balanceOf(trader.address);
      const USDC_BALANCE_LP1_BEFORE = await USDC_CONTRACT.balanceOf(trader.address);
      // console.log('SEE BALANCE: ', DAI_BALANCE_LP1_BEFORE, USDC_BALANCE_LP1_BEFORE);

      // Set approval for Pool to transfer in USDC on `trader` behalf
      await USDC_CONTRACT.connect(trader).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);
      await DAI_CONTRACT.connect(trader).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);
      const [RESERVES_0, RESERVES_1] = await DAI_USDC_POOL_CONTRACT.getReserves();
      // Preview DAI Amount out of the swap
      const PREVIEW_DAI_OUT = await DAI_USDC_POOL_CONTRACT.previewAmountOut(USDC_CONTRACT.address, ONE_HUNDRED_UNITS);
      // console.log('SEE PREVIEW DAI OUT', PREVIEW_DAI_OUT.toString(), RESERVES_0.toString(), RESERVES_1.toString());
      // Conduct swap
      const SWAP_TX = await DAI_USDC_POOL_CONTRACT.connect(trader).swap(
        ONE_HUNDRED_UNITS,
        USDC_CONTRACT.address,
        trader.address,
        '0x',
      );

      // console.log('SEE SWAP TX:', SWAP_TX);

      const [AFTER_RESERVE_0, AFTER_RESERVE_1] = await DAI_USDC_POOL_CONTRACT.getReserves();
      // console.log('SEE NEW RESERVES:', AFTER_RESERVE_0.toString(), AFTER_RESERVE_1.toString());

      // View Underlying + Yield Token Balances of AssetStrategy from YieldManager
      const [underlying_0, yield_0] = await DAI_USDC_POOL_CONTRACT.assetStrategyList(0);
      const [underlying_1, yield_1] = await DAI_USDC_POOL_CONTRACT.assetStrategyList(1);

      SDAI_BALANCE = await SDAI_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      FUSDC_BALANCE = await FUSDC_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      // console.log('See balances of SHARES AFTER:', SDAI_BALANCE.toString(), FUSDC_BALANCE.toString());
    });
  });

  describe('[Yield Accumulation from ERC-4626 Vault Strategies]', function () {
    it('should be harvest the accrued yield after an EPOCH', async function () {
      const {liquidityProvider1, DAI_CONTRACT, USDC_CONTRACT, SDAI_CONTRACT, FUSDC_CONTRACT, DAI_USDC_POOL_CONTRACT} =
        await loadFixture(deployFixture);

      // Set Approval for contract to transfer on `liquidityProvider1`'s behalf
      await DAI_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);
      await USDC_CONTRACT.connect(liquidityProvider1).approve(DAI_USDC_POOL_CONTRACT.address, ONE_THOUSAND_UNITS);

      // DEPOSIT liquidity to pool contract
      const LP1_DEPOSIT_TX = await DAI_USDC_POOL_CONTRACT.connect(liquidityProvider1).deposit(
        liquidityProvider1.address,
        ONE_THOUSAND_UNITS,
        ONE_THOUSAND_UNITS,
      );
      // console.log('SEE DEPOSIT TX', LP1_DEPOSIT_TX);
      let SDAI_BALANCE = await SDAI_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      let FUSDC_BALANCE = await FUSDC_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      // console.log('See balances of SHARES BEFORE:', SDAI_BALANCE.toString(), FUSDC_BALANCE.toString());

      let currentEpoch = await DAI_USDC_POOL_CONTRACT.currentEpoch();
      // console.log('See current epoch:', currentEpoch.toString());
      expect(Number(currentEpoch)).to.be.equal(0);

      const timestampBefore = (await ethers.provider.getBlock('latest')).timestamp;
      // console.log('SEE BEFORE TIMESTAMP:', timestampBefore);

      // Fast forward time by 1 month
      fastForwardTime(ONE_WEEK * 5);
      // fastForwardTime(ONE_YEAR);
      const timestampAfter = (await ethers.provider.getBlock('latest')).timestamp;
      // console.log('SEE AFTER TIMESTAMP:', timestampAfter);

      currentEpoch = await DAI_USDC_POOL_CONTRACT.currentEpoch();
      // console.log('See fast forwarded epoch', currentEpoch.toString());
      expect(Number(currentEpoch)).to.be.equal(1);

      const HARVEST_DETAILS = await DAI_USDC_POOL_CONTRACT.previewHarvestDetails();
      // console.log('SEE HARVEST DETAILS: ', HARVEST_DETAILS);

      const HARVEST_EPOCH_0_YIELD_TX = await DAI_USDC_POOL_CONTRACT.harvestYieldsForRecentEpoch();
      const CONTRACT_DAI_BALANCE = await DAI_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      const CONTRACT_SDAI_BALANCE = await SDAI_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      const CONTRACT_USDC_BALANCE = await USDC_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);
      const CONTRACT_FUSDC_BALANCE = await FUSDC_CONTRACT.balanceOf(DAI_USDC_POOL_CONTRACT.address);

      // console.log(
      //   'SEE BALANCES',
      //   CONTRACT_DAI_BALANCE.toString(),
      //   CONTRACT_SDAI_BALANCE.toString(),
      //   CONTRACT_USDC_BALANCE.toString(),
      //   CONTRACT_FUSDC_BALANCE.toString(),
      // );
    });
  });
});
