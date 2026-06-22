(function () {
  "use strict";

  const TRUE_OPTION = { id: "true", name: "True" };
  const FALSE_OPTION = { id: "false", name: "False" };

  function trueFalseOptions(trueFirst = true) {
    return trueFirst
      ? [{ ...TRUE_OPTION }, { ...FALSE_OPTION }]
      : [{ ...FALSE_OPTION }, { ...TRUE_OPTION }];
  }

  function choiceInputModeOptions() {
    return [
      { id: "singleSelect", name: "Multi-Select Single" },
      { id: "submitOnce", name: "Single Input Done State" },
      { id: "continuous", name: "Continuous Input" }
    ];
  }

  function votingCardFilterOptions() {
    return [
      { id: "all", name: "All Cards" },
      { id: "winners", name: "Correct Cards" },
      { id: "losers", name: "Wrong Cards" }
    ];
  }

  function playerFilterOptions() {
    return [
      { id: "all", name: "All Players" },
      { id: "correct", name: "Correct Players" },
      { id: "wrong", name: "Wrong Players" },
      { id: "votingWinner", name: "Voting Winner Authors" },
      { id: "votingLosers", name: "Voting Losing Authors" }
    ];
  }

  function roundOptions(maxRound = 5) {
    const max = Math.max(1, Math.floor(Number(maxRound) || 5));
    const options = [{ id: "current", name: "Current Round" }];
    for (let round = 1; round <= max; round += 1) {
      options.push({ id: String(round), name: `Round ${round}` });
    }
    return options;
  }

  function transitionTriggerOptions() {
    return [
      { id: "", name: "Immediate / Manual" },
      { id: "onCountdownComplete", name: "On Countdown Complete" }
    ];
  }

  function hostAudioPlayModeOptions() {
    return [
      { id: "random", name: "Play Random" },
      { id: "sequence", name: "Play In Sequence" },
      { id: "index", name: "Play At Index" }
    ];
  }

  window.PartyGameFlowActionOptions = {
    choiceInputModeOptions,
    hostAudioPlayModeOptions,
    playerFilterOptions,
    roundOptions,
    transitionTriggerOptions,
    trueFalseOptions,
    votingCardFilterOptions
  };
})();
