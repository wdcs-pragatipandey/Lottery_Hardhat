const { ethers } = require("hardhat");
const { assert, expect } = require("chai");

describe("Lottery Contract", function () {
  let owner;
  let addr1;
  let addr2;
  let addrs;
  let Lottery;
  let lottery;

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const LotteryFactory = await ethers.getContractFactory("Lottery");
    Lottery = await LotteryFactory.deploy(0);
    await Lottery.deployed();
    lottery = Lottery.connect(owner);
  });

  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  it("Should create a lottery", async function () {
    const addr1Address = await addr1.getAddress();

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
    const addr2Address = await addr2.getAddress();

    await lottery.createLottery(
      await addr1.getAddress(),
      100,
      1000,
      10,
      Math.floor(Date.now() / 1000) + 3600
    );

    const initialBalance = await ethers.provider.getBalance(addr2Address);

    const ticketPrice = 100;
    await lottery.connect(addr2).BuyTickets(1, 5, { value: ticketPrice * 5 });

    const finalBalance = await ethers.provider.getBalance(addr2Address);

    const remainingTickets = await lottery.getRemainingTickets(1);
    assert.equal(remainingTickets, 995);
  });

  it("Should draw lottery winner after expiration", async function () {
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; 
    await lottery.createLottery(addr1.address, 100, 1000, 10, expirationTime);

    await increaseTime(3601);

    try {
      const tx = await lottery.connect(addr1).DrawLotteryWinner(1); 
      const receipt = await tx.wait();

      const logs = receipt.logs;
      const event = logs.find(log => log.event === "LotteryWinnerRequestSent");
      const requestId = event.args.requestId;

      assert.isDefined(requestId, "Request ID should be defined");

      assert.isDefined(event, "LotteryWinnerRequestSent event should be emitted");

      assert.equal(receipt.status, 1, "Drawing lottery winner failed");

      const winner = await lottery.getWinner(1); 
      assert.notEqual(winner, "0x0000000000000000000000000000000000000000", "Lottery winner not set");
    } catch (error) {
      assert.fail(`Error drawing lottery winner: ${error.message}`);
    }
  });

  it("Should claim lottery winnings", async function () {
    const expirationTime = Math.floor(Date.now() / 1000) + 3600;
    const ticketPrice = 100;
    const maxTickets = 1000;
    const operatorCommissionPercentage = 10;

    await lottery.createLottery(addr1.address, ticketPrice, maxTickets, operatorCommissionPercentage, expirationTime+3600);

    const numTickets = 5;
    await lottery.connect(addr2).BuyTickets(1, numTickets, { value: ticketPrice * numTickets });

    await increaseTime(3601);

    await lottery.connect(addr1).DrawLotteryWinner(1);

    const initialOperatorBalance = await ethers.provider.getBalance(addr1.address);
    const initialWinnerBalance = await ethers.provider.getBalance(addr2.address);

    await lottery.connect(addr2).ClaimLottery(1);

    const finalOperatorBalance = await ethers.provider.getBalance(addr1.address);
    const finalWinnerBalance = await ethers.provider.getBalance(addr2.address);

    const vaultAmount = numTickets * ticketPrice;
    const operatorCommission = (vaultAmount * operatorCommissionPercentage) / 100;

    assert.equal(finalOperatorBalance.sub(initialOperatorBalance).toNumber(), operatorCommission, "Operator did not receive the correct commission");

    assert.equal(finalWinnerBalance.sub(initialWinnerBalance).toNumber(), vaultAmount - operatorCommission, "Winner did not receive the correct amount");
  });

  it("Should revert when creating a lottery with invalid parameters", async function () {
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
        await addr1.getAddress(),
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
        await addr1.getAddress(),
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
        await addr1.getAddress(),
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
      await lottery.connect(addr2).BuyTickets(999, 5, { value: 500 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.connect(addr2).BuyTickets(1, 5, { value: 400 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await lottery.connect(addr2).BuyTickets(1, 0, { value: 0 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }

    try {
      await increaseTime(7200);
      await lottery.connect(addr2).BuyTickets(1, 5, { value: 500 });
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });


  it("Should revert when drawing lottery winner under invalid conditions", async function () {
    try {
      await lottery.connect(addr1).DrawLotteryWinner(999);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
    try {
      await lottery.connect(addr1).DrawLotteryWinner(1);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });

  it("Should revert when claiming lottery winnings under invalid conditions", async function () {
    try {
      await lottery.connect(addr2).ClaimLottery(999);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
    try {
      await lottery.connect(addr1).ClaimLottery(1);
      assert.fail("Transaction should have reverted");
    } catch (error) {
      assert.include(error.message, "revert", "Error message must contain revert");
    }
  });



});
