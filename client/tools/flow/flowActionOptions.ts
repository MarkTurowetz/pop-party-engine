export interface FlowOption {
  id: string;
  name: string;
}

const TRUE_OPTION = { id: "true", name: "True" };
const FALSE_OPTION = { id: "false", name: "False" };

export function trueFalseOptions(trueFirst = true): FlowOption[] {
  return trueFirst
    ? [{ ...TRUE_OPTION }, { ...FALSE_OPTION }]
    : [{ ...FALSE_OPTION }, { ...TRUE_OPTION }];
}

export function choiceInputModeOptions(): FlowOption[] {
  return [
    { id: "singleSelect", name: "Multi-Select Single" },
    { id: "submitOnce", name: "Single Input Done State" },
    { id: "continuous", name: "Continuous Input" }
  ];
}

export function votingCardFilterOptions(): FlowOption[] {
  return [
    { id: "all", name: "All Cards" },
    { id: "winners", name: "Correct Cards" },
    { id: "losers", name: "Wrong Cards" }
  ];
}

export function playerFilterOptions(): FlowOption[] {
  return [
    { id: "all", name: "All Players" },
    { id: "correct", name: "Correct Players" },
    { id: "wrong", name: "Wrong Players" },
    { id: "votingWinner", name: "Voting Winner Authors" },
    { id: "votingLosers", name: "Voting Losing Authors" }
  ];
}

export function roundOptions(maxRound = 5): FlowOption[] {
  const max = Math.max(1, Math.floor(Number(maxRound) || 5));
  const options: FlowOption[] = [{ id: "current", name: "Current Round" }];
  for (let round = 1; round <= max; round += 1) {
    options.push({ id: String(round), name: `Round ${round}` });
  }
  return options;
}

export function transitionTriggerOptions(): FlowOption[] {
  return [
    { id: "", name: "Immediate / Manual" },
    { id: "onCountdownComplete", name: "On Countdown Complete" }
  ];
}

export function hostAudioPlayModeOptions(): FlowOption[] {
  return [
    { id: "random", name: "Play Random" },
    { id: "sequence", name: "Play In Sequence" },
    { id: "index", name: "Play At Index" }
  ];
}
