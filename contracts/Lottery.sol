// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";

contract Lottery is VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface COORDINATOR;
    uint64 subscriptionId;
    address vrfCoordinator = 0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625;
    bytes32 keyHash =
        0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c;
    uint32 callbackGasLimit = 100000;
    uint16 requestConfirmations = 3;
    uint32 numWords = 1;

    uint256 public lotteryCount = 0;

    struct LotteryData {
        address lotteryOperator;
        uint256 ticketPrice;
        uint256 maxTickets;
        uint256 operatorCommissionPercentage;
        uint256 expiration;
        address lotteryWinner;
        address[] tickets;
        address[] ticketHolders;
        uint256 numTicketsSold;
    }

    struct LotteryStatus {
        uint256 lotteryId;
        bool fulfilled;
        bool exists;
        uint256[] randomNumber;
    }

    mapping(uint256 => LotteryData) public lottery;
    mapping(uint256 => LotteryStatus) public requests;

    constructor(uint64 _subscriptionId) VRFConsumerBaseV2(vrfCoordinator) {
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);
        subscriptionId = _subscriptionId;
    }

    event LotteryCreated(
        address lotteryOperator,
        uint256 ticketPrice,
        uint256 maxTickets,
        uint256 operatorCommissionPercentage,
        uint256 expiration
    );

    event LogTicketCommission(
        uint256 lotteryId,
        address lotteryOperator,
        uint256 amount
    );

    event TicketsBought(
        address buyer,
        uint256 lotteryId,
        uint256 ticketsBought
    );

    event LotteryWinnerRequestSent(
        uint256 lotteryId,
        uint256 requestId,
        uint32 numWords
    );

    event RequestFulfilled(uint256 requestId, uint256[] randomWords);

    event LotteryWinnerDrawn(uint256 lotteryId, address lotteryWinner);

    event LotteryClaimed(
        uint256 lotteryId,
        address lotteryWinner,
        uint256 amount
    );

    modifier onlyOperator(uint256 _lotteryId) {
        require(
            (msg.sender == lottery[_lotteryId].lotteryOperator),
            "Error: Caller is not the lottery operator"
        );
        _;
    }

    modifier canClaimLottery(uint256 _lotteryId) {
        require(
            (lottery[_lotteryId].lotteryWinner != address(0x0)),
            "Error: Lottery Winner not yet drawn"
        );
        require(
            (msg.sender == lottery[_lotteryId].lotteryWinner ||
                msg.sender == lottery[_lotteryId].lotteryOperator),
            "Error: Caller is not the lottery winner"
        );
        _;
    }

    function getRemainingTickets(
        uint256 _lotteryId
    ) public view returns (uint256) {
        LotteryData storage currentLottery = lottery[_lotteryId];
        return currentLottery.maxTickets - currentLottery.tickets.length;
    }

    function createLottery(
        address _lotteryOperator,
        uint256 _ticketPrice,
        uint256 _maxTickets,
        uint256 _operatorCommissionPercentage,
        uint256 _expiration
    ) public {
        require(
            _lotteryOperator != address(0),
            "Error: Lottery operator cannot be 0x0"
        );
        require(
            (_operatorCommissionPercentage >= 0 &&
                _operatorCommissionPercentage % 5 == 0),
            "Error: Commission percentage should be greater than zero and multiple of 5"
        );
        require(
            _expiration > block.timestamp,
            "Error: Expiration must be greater than current block timestamp"
        );
        require(_maxTickets > 0, "Error: Max tickets must be greater than 0");
        require(_ticketPrice > 0, "Error: Ticket price must be greater than 0");
        address[] memory ticketsArray;
        lotteryCount++;
        lottery[lotteryCount] = LotteryData({
            lotteryOperator: _lotteryOperator,
            ticketPrice: _ticketPrice,
            maxTickets: _maxTickets,
            operatorCommissionPercentage: _operatorCommissionPercentage,
            expiration: _expiration,
            lotteryWinner: address(0),
            tickets: ticketsArray,
            ticketHolders: new address[](0),
            numTicketsSold: 0
        });
        emit LotteryCreated(
            _lotteryOperator,
            _ticketPrice,
            _maxTickets,
            _operatorCommissionPercentage,
            _expiration
        );
    }

    function BuyTickets(uint256 _lotteryId, uint256 _tickets) public payable {
        uint256 amount = msg.value;
        require(
            _tickets > 0,
            "Error: Number of tickets must be greater than 0"
        );
        require(
            _tickets <= getRemainingTickets(_lotteryId),
            "Error: Number of tickets must be less than or equal to remaining tickets"
        );
        require(
            amount >= _tickets * lottery[_lotteryId].ticketPrice,
            "Error: Ether value must be equal to number of tickets times ticket price"
        );
        require(
            block.timestamp < lottery[_lotteryId].expiration,
            "Error: Lottery has expired"
        );

        LotteryData storage currentLottery = lottery[_lotteryId];

        require(
            currentLottery.tickets.length + _tickets <=
                currentLottery.maxTickets,
            "Error: Adding tickets would exceed the maximum allowed"
        );

        for (uint256 i = 0; i < _tickets; i++) {
            currentLottery.tickets.push(msg.sender);
        }

        emit TicketsBought(msg.sender, _lotteryId, _tickets);
    }

    function DrawLotteryWinner(
        uint256 _lotteryId
    ) external onlyOperator(_lotteryId) returns (uint256 requestId) {
        require(
            block.timestamp > lottery[_lotteryId].expiration,
            "Error: Lottery has not yet expired"
        );
        require(
            lottery[_lotteryId].lotteryWinner == address(0),
            "Error: Lottery winner already drawn"
        );
        requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        requests[requestId] = LotteryStatus({
            lotteryId: _lotteryId,
            randomNumber: new uint256[](0),
            exists: true,
            fulfilled: false
        });
        emit LotteryWinnerRequestSent(_lotteryId, requestId, numWords);
        return requestId;
    }

    function ClaimLottery(
        uint256 _lotteryId
    ) public canClaimLottery(_lotteryId) {
        LotteryData storage currentLottery = lottery[_lotteryId];
        uint256 vaultAmount = currentLottery.tickets.length *
            currentLottery.ticketPrice;

        uint256 operatorCommission = vaultAmount /
            (100 / currentLottery.operatorCommissionPercentage);

        (bool sentCommission, ) = payable(currentLottery.lotteryOperator).call{
            value: operatorCommission
        }("");
        require(sentCommission);
        emit LogTicketCommission(
            _lotteryId,
            currentLottery.lotteryOperator,
            operatorCommission
        );

        uint256 winnerAmount = vaultAmount - operatorCommission;

        (bool sentWinner, ) = payable(currentLottery.lotteryWinner).call{
            value: winnerAmount
        }("");
        require(sentWinner);
        emit LotteryClaimed(
            _lotteryId,
            currentLottery.lotteryWinner,
            winnerAmount
        );
    }

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal override {
        require(requests[_requestId].exists, "Error: Request not found");
        uint256 lotteryId = requests[_requestId].lotteryId;
        requests[_requestId].fulfilled = true;
        requests[_requestId].randomNumber = _randomWords;
        uint256 winnerIndex = _randomWords[0] %
            lottery[lotteryId].numTicketsSold;
        lottery[lotteryId].lotteryWinner = lottery[lotteryId].ticketHolders[
            winnerIndex
        ];
        emit RequestFulfilled(_requestId, _randomWords);
    }
}
