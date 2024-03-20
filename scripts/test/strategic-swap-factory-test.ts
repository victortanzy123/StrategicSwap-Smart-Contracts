import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {DAI, SavingsDAI, USDC, FluxUSDC, StrategicPoolFactory} from '../../typechain-types';

import {deploy} from '../utils/hardhat-helpers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('Strategic Swap Pool Factory Test', function () {
  async function deployFixture() {
    const [owner, liquidityProvider1, liquidityProvider2, trader, FEE_RECEIVER, _] = await ethers.getSigners();

    // Deploy all Respective ancillary yield contracts

    // DAI Savings Rate
    const DAI_CONTRACT = await deploy<DAI>('DAI', []);
    const SDAI_CONTRACT = await deploy<SavingsDAI>('SavingsDAI', [DAI_CONTRACT.address]);

    // Flux USDC
    const USDC_CONTRACT = await deploy<USDC>('USDC', []);
    const FUSDC_CONTRACT = await deploy<FluxUSDC>('FluxUSDC', [USDC_CONTRACT.address]);

    // Pool Factory Deployment
    const POOL_FACTORY_CONTRACT = await deploy<StrategicPoolFactory>('StrategicPoolFactory', [FEE_RECEIVER.address]);

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
    };
  }

  const DEONOMINATED_BASIS_POINTS: number = 10000; // 100%
  const DEFAULT_FEE_SHARE_BPS: number = 5000; // 50%
  const NEW_FEE_SHARE_BPS: number = 3000;

  describe('[Pool Factory Deployment & Configurations]', function () {
    it('Should initialise owner as FEE_RECEIVER address', async function () {
      const {FEE_RECEIVER, POOL_FACTORY_CONTRACT} = await loadFixture(deployFixture);

      const registeredFeeReceiver = await POOL_FACTORY_CONTRACT.FEE_RECEIVER();
      expect(registeredFeeReceiver).to.be.equal(FEE_RECEIVER.address);
    });

    it('Should initialise both OWNER_FEE_MAX as 10_000', async function () {
      const {POOL_FACTORY_CONTRACT} = await loadFixture(deployFixture);

      const initialisedOwnerFeeMax = await POOL_FACTORY_CONTRACT.OWNER_FEE_MAX();
      expect(initialisedOwnerFeeMax.toString()).to.be.equal(DEONOMINATED_BASIS_POINTS.toString());
    });

    it('Should initialise fee info with the registered fee share and receiver address', async function () {
      const {FEE_RECEIVER, POOL_FACTORY_CONTRACT} = await loadFixture(deployFixture);

      const [receiverFeeShare, receiver] = await POOL_FACTORY_CONTRACT.feeInfo();
      expect(receiverFeeShare.toString()).to.be.equal(DEFAULT_FEE_SHARE_BPS.toString());
      expect(receiver).to.be.equal(FEE_RECEIVER.address);
    });

    it('Should allow owner to reconfigure receiver address', async function () {
      const {owner, POOL_FACTORY_CONTRACT} = await loadFixture(deployFixture);

      const SET_NEW_RECEIVER_TX = await POOL_FACTORY_CONTRACT.connect(owner).setFeeReceiver(owner.address);

      const [receiverFeeShare, receiver] = await POOL_FACTORY_CONTRACT.feeInfo();
      expect(receiverFeeShare.toString()).to.be.equal(DEFAULT_FEE_SHARE_BPS.toString());
      expect(receiver).to.be.equal(owner.address);
    });

    it('Should allow owner to reconfigure owner fee share', async function () {
      const {owner, FEE_RECEIVER, POOL_FACTORY_CONTRACT} = await loadFixture(deployFixture);

      const SET_NEW_FEE_BPS_TX = await POOL_FACTORY_CONTRACT.connect(owner).setReceiverFeeShare(NEW_FEE_SHARE_BPS);

      const [receiverFeeShare, receiver] = await POOL_FACTORY_CONTRACT.feeInfo();
      expect(receiverFeeShare.toString()).to.be.equal(NEW_FEE_SHARE_BPS.toString());
      expect(receiver).to.be.equal(FEE_RECEIVER.address);
    });
  });

  describe('[Pool Factory Deployment & Configurations]', function () {
    it('Should be able to allow any user to permissionlessly deploy a pool', async function () {
      const {liquidityProvider1, POOL_FACTORY_CONTRACT, DAI_CONTRACT, SDAI_CONTRACT, USDC_CONTRACT, FUSDC_CONTRACT} =
        await loadFixture(deployFixture);

      const initialPairsLength = await POOL_FACTORY_CONTRACT.allPairsLength();
      expect(initialPairsLength.toString()).to.be.equal('0');

      const POOL_DEPLOYMENT_TX = await POOL_FACTORY_CONTRACT.connect(liquidityProvider1).createPair(
        DAI_CONTRACT.address,
        USDC_CONTRACT.address,
        SDAI_CONTRACT.address,
        FUSDC_CONTRACT.address,
        true,
      );

      const newPairsLength = await POOL_FACTORY_CONTRACT.allPairsLength();
      expect(newPairsLength.toString()).to.be.equal('1');
    });

    it('Should NOT allow a pool with similar token configurations to be deployed again.', async function () {
      const {liquidityProvider1, POOL_FACTORY_CONTRACT, DAI_CONTRACT, SDAI_CONTRACT, USDC_CONTRACT, FUSDC_CONTRACT} =
        await loadFixture(deployFixture);

      // Deploy USDC-DAI Pool
      await POOL_FACTORY_CONTRACT.connect(liquidityProvider1).createPair(
        DAI_CONTRACT.address,
        USDC_CONTRACT.address,
        SDAI_CONTRACT.address,
        FUSDC_CONTRACT.address,
        true,
      );

      // Attempt to redeploy USDC-DAI Pool
      const POOL_REDEPLOYMENT_TX = POOL_FACTORY_CONTRACT.connect(liquidityProvider1).createPair(
        DAI_CONTRACT.address,
        USDC_CONTRACT.address,
        SDAI_CONTRACT.address,
        FUSDC_CONTRACT.address,
        true,
      ); // To revert this
      (await expect(POOL_REDEPLOYMENT_TX)).to.be.revertedWith('Pool already exists');
    });
  });
});
