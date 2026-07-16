export const controllerLayoutStateIds = Object.freeze({
  join: "join",
  lobby: "lobby",
  presentation: "controller-presentation",
  multipleChoice: "controller-multiple-choice",
  voting: "controller-voting",
  textInput: "controller-text-input",
  voiceInput: "controller-voice-input",
  microphoneAccess: "controller-microphone-access",
  paused: "controller-paused"
} as const);

export type ControllerLayoutStateId = (typeof controllerLayoutStateIds)[keyof typeof controllerLayoutStateIds];

export const semanticControllerLayoutStateIds = Object.freeze([
  controllerLayoutStateIds.presentation,
  controllerLayoutStateIds.multipleChoice,
  controllerLayoutStateIds.voting,
  controllerLayoutStateIds.textInput,
  controllerLayoutStateIds.voiceInput,
  controllerLayoutStateIds.microphoneAccess,
  controllerLayoutStateIds.paused
] as const);

const semanticStateIdSet = new Set<string>(semanticControllerLayoutStateIds);

export function isSemanticControllerLayoutStateId(value: unknown): value is ControllerLayoutStateId {
  return semanticStateIdSet.has(String(value || ""));
}

export function controllerChoiceLayoutStateId(inputType: unknown): ControllerLayoutStateId {
  return String(inputType || "").trim().toLowerCase() === "vote"
    ? controllerLayoutStateIds.voting
    : controllerLayoutStateIds.multipleChoice;
}

export function controllerTextLayoutStateId(inputType: unknown, inputMode: unknown = ""): ControllerLayoutStateId {
  const type = String(inputType || "").trim().toLowerCase();
  const mode = String(inputMode || "").trim().toLowerCase();
  return type === "voice" || mode === "voicevip"
    ? controllerLayoutStateIds.voiceInput
    : controllerLayoutStateIds.textInput;
}
