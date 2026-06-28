import {
  choiceInputModeOptions,
  hostAudioPlayModeOptions,
  playerFilterOptions,
  roundOptions,
  transitionTriggerOptions,
  trueFalseOptions,
  votingCardFilterOptions,
  type FlowOption
} from "./flowActionOptions";

export interface PartyGameFlowActionOptions {
  choiceInputModeOptions: () => FlowOption[];
  hostAudioPlayModeOptions: () => FlowOption[];
  playerFilterOptions: () => FlowOption[];
  roundOptions: (maxRound?: number) => FlowOption[];
  transitionTriggerOptions: () => FlowOption[];
  trueFalseOptions: (trueFirst?: boolean) => FlowOption[];
  votingCardFilterOptions: () => FlowOption[];
}

declare global {
  interface Window {
    PartyGameFlowActionOptions?: PartyGameFlowActionOptions;
  }
}

export function installFlowActionOptionsAdapter(target: Window = window): PartyGameFlowActionOptions {
  const adapter = {
    choiceInputModeOptions,
    hostAudioPlayModeOptions,
    playerFilterOptions,
    roundOptions,
    transitionTriggerOptions,
    trueFalseOptions,
    votingCardFilterOptions
  };
  target.PartyGameFlowActionOptions = adapter;
  target.document?.documentElement?.setAttribute("data-flow-action-options-adapter", "module");
  return adapter;
}
