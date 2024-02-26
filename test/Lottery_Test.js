const { assert, expect } = require('chai');
const { ethers, network } = require('hardhat');
require('dotenv').config();

describe('Lottery Contract', function () {
  let Lottery;
  let owner;
  let addr1;
  let addr2;
  let lottery;

  beforeEach(async function () {
    Lottery = "0x54945Dd8182fb20DaBAc106eC0D64b23030e4Ac9";
    owner = "0xF622D645865Cbd2A9eF2c35E7eD23c33785A3a82";
    addr1 = "0xE7A4865DC18d168a8F2af6Fe2Cfc0805C8299387";
    addr2 = "0xEEdE33770D09722B8B5Ada6A688c0806Dc5E8611";

    const LotteryContract = await ethers.getContractFactory("Lottery");
    lottery = await LotteryContract.attach(Lottery);
  });

  it("Should create a lottery", async function () {
    const addr1Address = addr1;

    await lottery.createLottery(
      addr1Address,
      100,
      1000,
      10,
      Math.floor(Date.now() / 1000) + 3600
    );

    const lotteryData = await lottery.lottery(1);
    assert.equal(lotteryData.lotteryOperator, addr1Address);
    assert.equal(lotteryData.ticketPrice, 100);
    assert.equal(lotteryData.maxTickets, 1000);
    assert.equal(lotteryData.operatorCommissionPercentage, 10);
  });

  it("Should allow buying tickets", async function () {
    const addr2PrivateKey = process.env.ACC_2_KEY;
    const addr2Wallet = new ethers.Wallet(addr2PrivateKey, ethers.provider);

    const initialBalance = await ethers.provider.getBalance(addr2Wallet.address);

    const ticketPrice = 100;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const expirationTime = currentTimestamp + 3600;
    assert.isBelow(currentTimestamp, expirationTime, "Lottery has expired");
    await lottery.connect(addr2Wallet).buyTickets(1, 5, { value: ticketPrice * 5 });

    const finalBalance = await ethers.provider.getBalance(addr2Wallet.address);

    const remainingTickets = await lottery.getRemainingTickets(1);
    assert.equal(remainingTickets, 995);
  });

  async function waitFor(timestamp) {
    const delay = timestamp * 1000 - Date.now();
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  it("Should draw lottery winner after expiration", async function () {
    const expirationTime = Math.floor(Date.now() / 1000) + 3600;

    await waitFor(expirationTime);

    try {
      const tx = await lottery.connect(addr1).drawLotteryWinner(1);
      const receipt = await tx.wait();
      const logs = receipt.logs;
      const event = logs.find(log => log.event === "LotteryWinnerRequestSent");
      const requestId = event.args.requestId;

      assert.isDefined(requestId, "Request ID should be defined");
      assert.isDefined(event, "LotteryWinnerRequestSent event should be emitted");
    } catch (error) {
      assert.fail(`Error drawing lottery winner: ${error.message}`);
    }
  });

  it("Should claim lottery winnings", async function () {
    try {
      const isWinnerDrawn = await lottery.drawLotteryWinner(1);
      assert.isTrue(isWinnerDrawn, "Lottery winner has not been drawn yet");

      await lottery.connect(addr2).claimLottery(1);
    } catch (error) {
      assert.fail(`Error claiming lottery winnings: ${error.message}`);
    }
  });

  it("Should revert when creating a lottery with invalid parameters", async function () {
    const addr1Address = addr1;
    try {
      await lottery.createLottery(
        ethers.constants.AddressZero,
        100,
        1000,
        10,
        Math.floor(Date.now() / 1000) + 3600
      );
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.createLottery(
        addr1Address,
        100,
        1000,
        10,
        Math.floor(Date.now() / 1000) - 3600
      );
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.createLottery(
        addr1Address,
        0,
        1000,
        10,
        Math.floor(Date.now() / 1000) + 3600
      );
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.createLottery(
        addr1Address,
        100,
        0,
        10,
        Math.floor(Date.now() / 1000) + 3600
      );
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });

  it("Should revert when buying tickets with invalid inputs", async function () {
    try {
      await lottery.connect(addr2).buyTickets(999, 5, { value: 500 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.connect(addr2).buyTickets(1, 5, { value: 400 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.connect(addr2).buyTickets(1, 0, { value: 0 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.connect(addr2).buyTickets(1, 5, { value: 500 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });

  it("Should revert when drawing lottery winner under invalid conditions", async function () {
    try {
      await lottery.connect(addr1).drawLotteryWinner(999);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
    try {
      await lottery.connect(addr1).drawLotteryWinner(1);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });

  it("Should revert when claiming lottery winnings under invalid conditions", async function () {
    try {
      await lottery.connect(addr2).claimLottery(999);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
    try {
      await lottery.connect(addr1).claimLottery(1);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });
});














