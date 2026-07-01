# Simple Automated Market Maker

Homework 4 implementation of a simplified Uniswap V2-style automated market maker.

## Overview

This project contains a Solidity smart contract called `SimpleAMM`. The contract manages a two-token liquidity pool and supports the three required AMM operations:

- `deposit`: add token A and token B liquidity to the pool
- `redeem`: remove proportional liquidity from the pool
- `swap`: trade token A for token B, or token B for token A

The AMM also mints its own ERC20 liquidity token, `SAMM-LP`, to represent each liquidity provider's share of the pool.

## Contract Behavior

### Deposit

`deposit(uint256 amountA, uint256 amountB)` transfers token A and token B from the user into the AMM.

- The first deposit initializes the pool.
- The first liquidity amount is calculated with the geometric mean: `sqrt(amountA * amountB)`.
- Later deposits must match the current reserve ratio.
- The user receives newly minted LP tokens.

### Redeem

`redeem(uint256 amountA, uint256 amountB)` removes liquidity from the pool.

- The requested token amounts must be proportional to the pool reserves.
- The contract burns the required amount of LP tokens.
- The user receives token A and token B back from the pool.

### Swap

`swap(address tokenIn, uint256 amountIn, uint256 minAmountOut)` swaps one pool token for the other.

- `tokenIn` must be either token A or token B.
- The output amount is calculated using a constant-product formula:

```solidity
amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
```

- `minAmountOut` provides slippage protection.
- The swap reverts if the output is lower than `minAmountOut`.

## Project Structure

```text
contracts/
  SimpleAMM.sol      Main AMM contract
  TestERC20.sol      Mintable ERC20 token used by tests

test/
  SimpleAMM.js       Hardhat test suite

coverage/
  index.html         HTML coverage report

hardhat.config.js    Hardhat and coverage configuration
package.json         Project scripts and dependencies
```

## Setup

Install dependencies:

```sh
npm install
```

## Commands

Compile the contracts:

```sh
npx hardhat compile
```

Run the full test suite:

```sh
npm test
```

Run tests by feature:

```sh
npx hardhat test --grep "deployment"
npx hardhat test --grep "deposit"
npx hardhat test --grep "redeem"
npx hardhat test --grep "swap"
```

Generate the coverage report:

```sh
npm run coverage
```

Open the HTML coverage report on Windows:

```powershell
start coverage\index.html
```

## Test Coverage

The test suite covers successful and failing paths for:

- contract deployment
- deposits
- redemptions
- swaps
- invalid tokens
- empty pools
- invalid ratios
- insufficient reserves
- slippage protection
- zero-amount inputs

Latest verified coverage:

```text
Statements: 100%
Branches:   100%
Functions:  100%
Lines:      100%
```
