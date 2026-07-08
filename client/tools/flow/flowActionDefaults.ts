import type { FlowAction } from "../../types/game-data";

export interface FlowActionDefaultsContext {
  defaultControllerLayoutId?: () => string;
  ensureActionTiming?: (action: FlowAction, isSubAction?: boolean) => void;
  ensureDecisionBranches?: (action: FlowAction) => FlowAction[];
  firstHostAudioId?: () => string;
}

export interface FlowActionDefaults {
  applyActionTypeDefaults: (action: FlowAction, value: string, isSubAction?: boolean) => void;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function createActionDefaults(context: FlowActionDefaultsContext = {}): FlowActionDefaults {
  function firstHostAudioId() {
    return typeof context.firstHostAudioId === "function" ? context.firstHostAudioId() : "";
  }

  function applyActionTypeDefaults(action: FlowAction, value: string, isSubAction = false): void {
    action.type = value;
    const globals = globalThis as typeof globalThis & {
      PartyChoiceInputActions?: { choiceInputActionConfig?: (type: string) => Record<string, unknown> | null | undefined };
      PartyMicrophoneAccessActions?: {
        microphoneAccessActionConfig?: (type: string) => Record<string, unknown> | null | undefined;
        normalizeMicrophoneAccessMode?: (mode: unknown) => string;
      };
      PartyTextAnswerActions?: { textAnswerActionConfig?: (type: string) => Record<string, unknown> | null | undefined };
    };

    if (value === "presentText") {
      action.text = text(action.text, "Presented text");
      if (!("textTarget" in action)) action.textTarget = "";
      action.stageClickTargetActionId = text(action.stageClickTargetActionId);
    }
    const choiceInputConfig = globals.PartyChoiceInputActions?.choiceInputActionConfig?.(value);
    if (value === "multipleChoiceInput") {
      action.prompt = text(action.prompt, text(choiceInputConfig?.prompt, "Answer this question by tapping an answer"));
      action.options = Array.isArray(action.options) && action.options.length ? action.options : ["A", "B", "C", "D"];
      action.inputMode = text(action.inputMode, "singleSelect");
      action.locked = bool(action.locked);
      action.timerEndTargetActionId = text(action.timerEndTargetActionId);
      action.answersSubmittedTargetActionId = text(action.answersSubmittedTargetActionId);
    }
    if (value === "getRandomMultipleChoiceContent") action.variableName = text(action.variableName, "multipleChoicePrompt");
    if (value === "triviaInput") {
      action.contentVariable = text(action.contentVariable, "multipleChoicePrompt");
      action.prompt = text(action.prompt, text(choiceInputConfig?.prompt, "Answer this question by tapping an answer"));
      action.inputMode = text(action.inputMode, text(choiceInputConfig?.inputMode, "submitOnce"));
      action.locked = bool(action.locked);
      action.randomizeOptions = bool(action.randomizeOptions);
      action.timerEndTargetActionId = text(action.timerEndTargetActionId);
      action.answersSubmittedTargetActionId = text(action.answersSubmittedTargetActionId);
    }
    const textAnswerConfig = globals.PartyTextAnswerActions?.textAnswerActionConfig?.(value);
    if (textAnswerConfig) {
      action.prompt = text(action.prompt, text(textAnswerConfig.prompt));
      action.placeholder = text(action.placeholder, text(textAnswerConfig.placeholder));
      action.characterLimit = numberValue(action.characterLimit);
      action.timerEndTargetActionId = text(action.timerEndTargetActionId);
      action.answersSubmittedTargetActionId = text(action.answersSubmittedTargetActionId);
    }
    const microphoneAccessConfig = globals.PartyMicrophoneAccessActions?.microphoneAccessActionConfig?.(value);
    if (microphoneAccessConfig) {
      action.prompt = text(action.prompt, text(microphoneAccessConfig.prompt));
      action.buttonLabel = text(action.buttonLabel, text(microphoneAccessConfig.buttonLabel));
      action.microphoneAccessMode = globals.PartyMicrophoneAccessActions?.normalizeMicrophoneAccessMode?.(action.microphoneAccessMode || microphoneAccessConfig.mode) || "vip";
      action.microphoneAccessGrantedTargetActionId = text(action.microphoneAccessGrantedTargetActionId);
    }
    if (value === "setVotingCardsShown") {
      action.isShown = action.isShown !== false;
      action.instant = bool(action.instant);
      action.cardFilter = text(action.cardFilter, "all");
    }
    if (value === "voteOnAnswersInput") {
      action.prompt = text(action.prompt, text(choiceInputConfig?.prompt, "Vote for your favorite answer"));
      action.timerEndTargetActionId = text(action.timerEndTargetActionId);
      action.answersSubmittedTargetActionId = text(action.answersSubmittedTargetActionId);
    }
    if (value === "revealVotes") action.voteRevealStaggerSeconds = numberValue(action.voteRevealStaggerSeconds, 1);
    if (value === "displayText") {
      action.text = text(action.text, "Displayed text");
      if (!("textTarget" in action)) action.textTarget = "";
    }
    if (value === "getPlayerAnswers") {
      action.inputId = text(action.inputId, "input");
      action.round = text(action.round, "current");
      action.variableName = text(action.variableName, "playerAnswers");
    }
    if (value === "playAudio") action.audioUrl = text(action.audioUrl);
    if (value === "playHostAudio") {
      action.hostAudioId = text(action.hostAudioId, firstHostAudioId());
      action.playMode = text(action.playMode, "random");
      action.lineIndex = Math.max(0, Math.floor(numberValue(action.lineIndex)));
    }
    if (value === "labelNode") {
      action.labelText = text(action.labelText, text(action.text, "Flow note"));
      action.timing = { mode: "E+", seconds: 0 };
      action.subActions = [];
    }
    if (value === "codeNode") {
      action.code = text(action.code, "g.example = true");
      action.timing = { mode: "E+", seconds: 0 };
      action.subActions = [];
    }
    if (["presentText", "displayText", "text", "setPlayersShown", "setPlayerAnswersShown", "setGameObjectShown", "setArtAssetShown"].includes(value)) action.isShown = action.isShown !== false;
    if (value === "setGameObjectShown" || value === "setArtAssetShown") {
      action.targetLayoutElementId = text(action.targetLayoutElementId);
      action.targetLayoutSurface = text(action.targetLayoutSurface, "stage");
    }
    if (value === "playGameObjectAnimation" || value === "stopGameObjectAnimation") {
      action.targetLayoutElementId = text(action.targetLayoutElementId);
      action.targetLayoutSurface = text(action.targetLayoutSurface, "stage");
      action.animationName = text(action.animationName, "appear");
      if (value === "playGameObjectAnimation") action.instant = bool(action.instant);
    }
    if (value === "setPlayerAnswersShown" || value === "showPoints") action.playerFilter = text(action.playerFilter, value === "showPoints" ? "correct" : "all");
    if (value === "showPoints") action.points = Math.max(0, Math.floor(numberValue(action.points)));
    if (value === "setTimerShown") action.isShown = action.isShown !== false;
    if (value === "setWipeShown") {
      action.isShown = action.isShown !== false;
      action.instant = bool(action.instant);
    }
    if (value === "setControllerLayout") action.controllerLayoutId = text(action.controllerLayoutId, context.defaultControllerLayoutId?.() || "");
    if (value === "jumpNode") {
      action.jumpTargetActionId = text(action.jumpTargetActionId, "none");
      action.nextTargetActionId = "";
      action.timing = { mode: "E+", seconds: 0 };
      action.subActions = [];
    }
    if (value === "subroutine") {
      action.entryTargetActionId = text(action.entryTargetActionId);
      action.nextTargetActionId = text(action.nextTargetActionId);
      action.actions = Array.isArray(action.actions) ? action.actions : [];
      action.subActions = [];
      action.timing = { mode: "E+", seconds: 0 };
    }
    if (value === "decision") {
      action.variable = text(action.variable, "activePlayerCount");
      action.valueType = text(action.valueType, "int");
      context.ensureDecisionBranches?.(action);
    }
    if (value === "transition") action.transition = text(action.transition, "horizontalWipe");
    if (value === "transitionState") action.targetState = text(action.targetState, "intro");
    if (value === "presentText" || value === "displayText" || value === "text") action.textTarget = text(action.textTarget, "presentation");
    if (value !== "jumpNode" && value !== "labelNode" && value !== "codeNode" && value !== "subroutine") context.ensureActionTiming?.(action, isSubAction);
  }

  return { applyActionTypeDefaults };
}
