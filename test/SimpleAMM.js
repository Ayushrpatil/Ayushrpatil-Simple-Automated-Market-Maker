const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleAMM", function () {
  const amount = ethers.parseEther;

  let owner;
  let provider;
  let trader;
  let other;
  let tokenA;
  let tokenB;
  let amm;

  async function deployTokens() {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const a = await TestERC20.deploy("Token A", "TKA");
    const b = await TestERC20.deploy("Token B", "TKB");
    return { a, b };
  }

  async function deployAMM() {
    ({ a: tokenA, b: tokenB } = await deployTokens());

    const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
    amm = await SimpleAMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());

    for (const account of [provider, trader, other]) {
      await tokenA.mint(account.address, amount("10000"));
      await tokenB.mint(account.address, amount("10000"));
      await tokenA.connect(account).approve(await amm.getAddress(), amount("10000"));
      await tokenB.connect(account).approve(await amm.getAddress(), amount("10000"));
    }
  }

  async function seedPool(amountA = amount("1000"), amountB = amount("1000")) {
    await amm.connect(provider).deposit(amountA, amountB);
  }

  beforeEach(async function () {
    [owner, provider, trader, other] = await ethers.getSigners();
    await deployAMM();
  });

  describe("deployment", function () {
    it("stores the token pair and starts with empty reserves", async function () {
      expect(await amm.tokenA()).to.equal(await tokenA.getAddress());
      expect(await amm.tokenB()).to.equal(await tokenB.getAddress());
      expect(await amm.reserveA()).to.equal(0);
      expect(await amm.reserveB()).to.equal(0);
      expect(await amm.name()).to.equal("Simple AMM Liquidity Token");
      expect(await amm.symbol()).to.equal("SAMM-LP");
    });

    it("rejects a zero token A address", async function () {
      const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
      await expect(SimpleAMM.deploy(ethers.ZeroAddress, await tokenB.getAddress()))
        .to.be.revertedWithCustomError(amm, "ZeroAddress");
    });

    it("rejects a zero token B address", async function () {
      const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
      await expect(SimpleAMM.deploy(await tokenA.getAddress(), ethers.ZeroAddress))
        .to.be.revertedWithCustomError(amm, "ZeroAddress");
    });

    it("rejects identical token addresses", async function () {
      const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
      await expect(SimpleAMM.deploy(await tokenA.getAddress(), await tokenA.getAddress()))
        .to.be.revertedWithCustomError(amm, "IdenticalTokens");
    });
  });

  describe("deposit", function () {
    it("accepts the first deposit and mints geometric-mean liquidity", async function () {
      const amountA = amount("400");
      const amountB = amount("900");
      const expectedLiquidity = amount("600");

      await expect(amm.connect(provider).deposit(amountA, amountB))
        .to.emit(amm, "Deposited")
        .withArgs(provider.address, amountA, amountB, expectedLiquidity);

      expect(await amm.reserveA()).to.equal(amountA);
      expect(await amm.reserveB()).to.equal(amountB);
      expect(await amm.balanceOf(provider.address)).to.equal(expectedLiquidity);
      expect(await tokenA.balanceOf(await amm.getAddress())).to.equal(amountA);
      expect(await tokenB.balanceOf(await amm.getAddress())).to.equal(amountB);
    });

    it("accepts later deposits only at the pool ratio", async function () {
      await seedPool(amount("1000"), amount("2000"));
      const expectedLiquidity = (amount("250") * await amm.totalSupply()) / amount("1000");

      await expect(amm.connect(other).deposit(amount("250"), amount("500")))
        .to.emit(amm, "Deposited")
        .withArgs(other.address, amount("250"), amount("500"), expectedLiquidity);

      expect(await amm.reserveA()).to.equal(amount("1250"));
      expect(await amm.reserveB()).to.equal(amount("2500"));
      expect(await amm.balanceOf(other.address)).to.equal(expectedLiquidity);
    });

    it("rejects a zero token A deposit", async function () {
      await expect(amm.connect(provider).deposit(0, amount("1")))
        .to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("rejects a zero token B deposit", async function () {
      await expect(amm.connect(provider).deposit(amount("1"), 0))
        .to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("rejects non-proportional later deposits", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(other).deposit(amount("100"), amount("101")))
        .to.be.revertedWithCustomError(amm, "InvalidRatio");
    });
  });

  describe("redeem", function () {
    it("burns liquidity and returns proportional reserves", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(provider).redeem(amount("250"), amount("250")))
        .to.emit(amm, "Redeemed")
        .withArgs(provider.address, amount("250"), amount("250"), amount("250"));

      expect(await amm.reserveA()).to.equal(amount("750"));
      expect(await amm.reserveB()).to.equal(amount("750"));
      expect(await amm.balanceOf(provider.address)).to.equal(amount("750"));
      expect(await tokenA.balanceOf(provider.address)).to.equal(amount("9250"));
      expect(await tokenB.balanceOf(provider.address)).to.equal(amount("9250"));
    });

    it("can redeem the entire pool", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await amm.connect(provider).redeem(amount("1000"), amount("1000"));

      expect(await amm.totalSupply()).to.equal(0);
      expect(await amm.reserveA()).to.equal(0);
      expect(await amm.reserveB()).to.equal(0);
    });

    it("rejects a zero token A redemption", async function () {
      await expect(amm.connect(provider).redeem(0, amount("1")))
        .to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("rejects a zero token B redemption", async function () {
      await expect(amm.connect(provider).redeem(amount("1"), 0))
        .to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("rejects redemption from an empty pool", async function () {
      await expect(amm.connect(provider).redeem(amount("1"), amount("1")))
        .to.be.revertedWithCustomError(amm, "PoolEmpty");
    });

    it("rejects redemption above token A reserves", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(provider).redeem(amount("1001"), amount("1000")))
        .to.be.revertedWithCustomError(amm, "InsufficientReserves");
    });

    it("rejects redemption above token B reserves", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(provider).redeem(amount("1000"), amount("1001")))
        .to.be.revertedWithCustomError(amm, "InsufficientReserves");
    });

    it("rejects non-proportional redemptions", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(provider).redeem(amount("100"), amount("101")))
        .to.be.revertedWithCustomError(amm, "InvalidRatio");
    });

    it("rejects users without enough liquidity tokens", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(other).redeem(amount("100"), amount("100")))
        .to.be.revertedWithCustomError(amm, "ERC20InsufficientBalance");
    });
  });

  describe("swap", function () {
    it("swaps token A for token B using the constant-product formula", async function () {
      await seedPool(amount("1000"), amount("1000"));
      const expectedOut = await amm.getAmountOut(amount("100"), amount("1000"), amount("1000"));

      await expect(amm.connect(trader).swap(await tokenA.getAddress(), amount("100"), expectedOut))
        .to.emit(amm, "Swapped")
        .withArgs(trader.address, await tokenA.getAddress(), amount("100"), expectedOut);

      expect(await amm.reserveA()).to.equal(amount("1100"));
      expect(await amm.reserveB()).to.equal(amount("1000") - expectedOut);
      expect(await tokenB.balanceOf(trader.address)).to.equal(amount("10000") + expectedOut);
    });

    it("swaps token B for token A using the constant-product formula", async function () {
      await seedPool(amount("1000"), amount("1000"));
      const expectedOut = await amm.getAmountOut(amount("50"), amount("1000"), amount("1000"));

      await expect(amm.connect(trader).swap(await tokenB.getAddress(), amount("50"), 1))
        .to.emit(amm, "Swapped")
        .withArgs(trader.address, await tokenB.getAddress(), amount("50"), expectedOut);

      expect(await amm.reserveA()).to.equal(amount("1000") - expectedOut);
      expect(await amm.reserveB()).to.equal(amount("1050"));
      expect(await tokenA.balanceOf(trader.address)).to.equal(amount("10000") + expectedOut);
    });

    it("rejects zero input swaps", async function () {
      await expect(amm.connect(trader).swap(await tokenA.getAddress(), 0, 0))
        .to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("rejects swaps before liquidity exists", async function () {
      await expect(amm.connect(trader).swap(await tokenA.getAddress(), amount("1"), 0))
        .to.be.revertedWithCustomError(amm, "PoolEmpty");
    });

    it("rejects unsupported input tokens", async function () {
      await seedPool(amount("1000"), amount("1000"));
      const TestERC20 = await ethers.getContractFactory("TestERC20");
      const unsupported = await TestERC20.deploy("Unsupported", "NOPE");

      await expect(amm.connect(trader).swap(await unsupported.getAddress(), amount("1"), 0))
        .to.be.revertedWithCustomError(amm, "InvalidToken");
    });

    it("rejects swaps that round to zero output", async function () {
      await seedPool(amount("1000"), amount("1000"));

      await expect(amm.connect(trader).swap(await tokenA.getAddress(), 1, 0))
        .to.be.revertedWithCustomError(amm, "InsufficientOutputAmount");
    });

    it("rejects swaps below the requested minimum output", async function () {
      await seedPool(amount("1000"), amount("1000"));
      const expectedOut = await amm.getAmountOut(amount("10"), amount("1000"), amount("1000"));

      await expect(amm.connect(trader).swap(await tokenA.getAddress(), amount("10"), expectedOut + 1n))
        .to.be.revertedWithCustomError(amm, "SlippageExceeded")
        .withArgs(expectedOut, expectedOut + 1n);
    });
  });
});
