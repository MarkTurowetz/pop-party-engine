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

export function controllerLayoutCandidateIds(
  phase: unknown,
  selectedLayoutId: unknown,
  hasControllerState = true,
  preferRequestedState = false
): string[] {
  const candidates: string[] = [];
  const add = (value: unknown) => {
    const id = String(value || "").trim();
    if (id && !candidates.includes(id)) candidates.push(id);
  };
  if (!hasControllerState) {
    add(controllerLayoutStateIds.join);
    add(controllerLayoutStateIds.lobby);
    return candidates;
  }

  const phaseId = String(phase || "").trim();
  if (phaseId === controllerLayoutStateIds.join) {
    add(controllerLayoutStateIds.join);
    add(controllerLayoutStateIds.lobby);
    return candidates;
  }
  if (isSemanticControllerLayoutStateId(phaseId)) {
    add(phaseId);
    add(controllerLayoutStateIds.presentation);
    add(controllerLayoutStateIds.lobby);
    return candidates;
  }

  const selectedId = String(selectedLayoutId || "").trim();
  if (preferRequestedState) add(phaseId);
  add(selectedId || (phaseId === "starting" ? controllerLayoutStateIds.lobby : phaseId || controllerLayoutStateIds.lobby));
  add(phaseId === "lobby" || phaseId === "starting" ? controllerLayoutStateIds.lobby : controllerLayoutStateIds.presentation);
  add(controllerLayoutStateIds.lobby);
  return candidates;
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
