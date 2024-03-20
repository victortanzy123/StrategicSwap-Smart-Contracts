# StrategicSwap Contracts

## Compilation

Run the following command to compile all contracts:

```
yarn compile
```

## Deployment

1. Ensure `.env` file has been filled appropriately via reference from `.env.example` file.

2. Deploy all underlying contracts for an ERC-4626 Strategy at `/scripts/deploy/erc4626-strategies.ts` via running this command:

```
yarn deploy-strategies:sepolia
```

3. Deploy StrategicSwap Factory contract and the USDC-DAI pool on the factory at `/scripts/deploy/strategic-swap-factory.ts` via running this command:

```
yarn deploy-factory:sepolia
```

## StrategicSwap Test Automation

1. **StrategicSwapFactory** - `/scripts/test/strategic-swap-factory-test.ts`

Run the following command to execute the test script:

```
yarn test:factory
```

2. **StrategicSwapERC4626Pool** - `/scripts/test/strategic-swap-test.ts`
   Run the following command to execute the test script:

```
yarn test:main
```

## Deployed Contract Addresses

### Sepolia Testnet

`DAI`: 0x78D91d7B51Eb07FC4B13c514EDDf566C3d12261F

`USDC`: 0x4Ee80e4CA7CdC16540574d7faBe434537d2345b0

`Savings DAI ERC4626 Vault`: 0x265677177927A85cf1d3FfFb678D189e66119b09

`Flux USDC ERC4626 Vault`: 0x72c2EE9517664F1A645E808a1FbfCaB4aae68d9C

`StrategicSwapFactory`: 0xDf0655E596aE98CfE7163d81F65847e5e8841B06

`StrategicSwapERC4626Pool (USDC-DAI)`: 0x124d3f000630A23A51e34A402596DB25645E5693
