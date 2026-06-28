import type { FlowAction, FlowTiming } from "../../types/game-data";

export interface FlowActionSummaryContext {
  artAssetTargetName?: (elementId?: unknown, scope?: unknown) => string;
  decisionSummary: (action: FlowAction) => string;
  decisionVariableName: (variable?: unknown) => string;
  ensureActionTiming: (action: FlowAction, isSubAction?: boolean) => FlowTiming;
  flowStateName: (stateId?: unknown) => string;
  flowTargetActionName: (actionId?: unknown) => string;
  gameObjectTargetName?: (elementId?: unknown, scope?: unknown) => string;
  hostAudioDisplayName: (hostAudioId?: unknown) => string;
  textTargetName: (target?: unknown) => string;
  transitionName: (transitionId?: unknown) => string;
}

export interface FlowActionValueBadge {
  text: string;
  className: string;
}

export interface FlowActionSummaryRuntime {
  actionSummary: (action: FlowAction, isSubAction?: boolean) => string;
  actionTimingLabel: (action: FlowAction, isSubAction?: boolean) => string;
  actionValueBadge: (action: FlowAction | null | undefined) => FlowActionValueBadge | null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function externalActionConfig(globalName: string, methodName: string, actionType: string): Record<string, unknown> {
  const source = (globalThis as unknown as Record<string, Record<string, unknown> | undefined>)[globalName];
  const method = source?.[methodName];
  if (typeof method !== "function") return {};
  return (method as (type: string) => Record<string, unknown> | null | undefined)(actionType) || {};
}

export function createActionSummary(context: FlowActionSummaryContext): FlowActionSummaryRuntime {
  function jumpTargetIsMissing(action: FlowAction | null | undefined): boolean {
    const target = String(action?.jumpTargetActionId || "").toLowerCase();
    return !target || target === "none";
  }

  function timingLabel(action: FlowAction, isSubAction = false, fractionDigits = 1): string {
    const timing = context.ensureActionTiming(action, isSubAction);
    return `${timing.mode} ${numberValue(timing.seconds).toFixed(fractionDigits)}s`;
  }

  function targetActionName(target: unknown): string {
    return context.flowTargetActionName(target);
  }

  function actionSummary(action: FlowAction, isSubAction = false): string {
    if (action.type === "jumpNode") {
      return jumpTargetIsMissing(action)
        ? "\u26a0 Jump target required"
        : `Jump -> ${targetActionName(action.jumpTargetActionId)}`;
    }
    if (action.type === "labelNode") return text(action.labelText, "Flow note");
    if (action.type === "codeNode") return text(action.code, "g.example = true");

    const timingText = timingLabel(action, isSubAction);
    const targetText = action.textTarget ? context.textTargetName(action.textTarget) : "\u26a0 No Field";
    const instantText = action.instant ? " / Instant" : "";

    if (action.type === "presentText") {
      const eventText = ` / click: ${targetActionName(action.stageClickTargetActionId)}`;
      return `${action.isShown === false ? "Hide" : "Show"} ${targetText}: "${text(action.text)}"${eventText} / ${timingText}${instantText}`;
    }
    if (action.type === "multipleChoiceInput") {
      const config = externalActionConfig("PartyChoiceInputActions", "choiceInputActionConfig", action.type);
      const modeName = action.inputMode === "submitOnce" ? "Submit Once" : action.inputMode === "continuous" ? "Continuous" : "Single Select";
      const lockedText = action.inputMode === "singleSelect" && action.locked ? " / Locked" : "";
      const eventText = ` / timer: ${targetActionName(action.timerEndTargetActionId)} / answers: ${targetActionName(action.answersSubmittedTargetActionId)}`;
      return `${modeName}${lockedText}: ${text(action.prompt, text(config.prompt, "Choice input"))} / ${(Array.isArray(action.options) ? action.options : []).length || 0} options${eventText} / ${timingText}`;
    }
    if (action.type === "getRandomMultipleChoiceContent") return `Get random prompt -> ${text(action.variableName, "multipleChoicePrompt")} / ${timingText}`;
    if (action.type === "triviaInput") {
      const modeName = action.inputMode === "singleSelect" ? "Single Select" : action.inputMode === "continuous" ? "Continuous" : "Submit Once";
      const randomText = action.randomizeOptions ? " / Randomized" : "";
      const eventText = ` / timer: ${targetActionName(action.timerEndTargetActionId)} / answers: ${targetActionName(action.answersSubmittedTargetActionId)}`;
      return `Trivia from ${text(action.contentVariable, "multipleChoicePrompt")} / ${modeName}${randomText}${eventText} / ${timingText}`;
    }
    if (action.type === "textSubmissionInput" || action.type === "voiceSubmissionInput") {
      const config = externalActionConfig("PartyTextAnswerActions", "textAnswerActionConfig", action.type);
      const limitText = numberValue(action.characterLimit) > 0 ? ` / ${numberValue(action.characterLimit)} chars` : "";
      const eventText = ` / timer: ${targetActionName(action.timerEndTargetActionId)} / answers: ${targetActionName(action.answersSubmittedTargetActionId)}`;
      const defaultPrompt = action.type === "voiceSubmissionInput" ? "Say your answer" : "Write your answer";
      const prefix = action.type === "voiceSubmissionInput" ? "VIP Voice Submit" : "Text Submit";
      const suffix = action.type === "voiceSubmissionInput" ? " / Transcript stored as text" : " / Stage validates";
      return `${prefix}: ${text(action.prompt, text(config.prompt, defaultPrompt))}${limitText}${suffix}${eventText} / ${timingText}`;
    }
    if (action.type === "requestMicrophoneAccessInput") {
      const config = externalActionConfig("PartyMicrophoneAccessActions", "microphoneAccessActionConfig", action.type);
      const modeName = action.microphoneAccessMode === "all" ? "All Players" : "VIP";
      const eventText = ` / granted: ${targetActionName(action.microphoneAccessGrantedTargetActionId)}`;
      return `Request Mic Access (${modeName}): ${text(action.prompt, text(config.prompt, "Give microphone access"))}${eventText} / ${timingText}`;
    }
    if (action.type === "prepareVotingCards") return `Prepare anonymous voting cards / ${timingText}`;
    if (action.type === "setVotingCardsShown") {
      const cardFilterName = action.cardFilter === "winners" || action.cardFilter === "correct"
        ? "correct"
        : action.cardFilter === "losers" || action.cardFilter === "wrong"
          ? "wrong"
          : "all";
      return `${action.isShown === false ? "Hide" : "Show"} ${cardFilterName} voting cards / ${timingText}${instantText}`;
    }
    if (action.type === "voteOnAnswersInput") {
      const config = externalActionConfig("PartyChoiceInputActions", "choiceInputActionConfig", action.type);
      const eventText = ` / timer: ${targetActionName(action.timerEndTargetActionId)} / votes: ${targetActionName(action.answersSubmittedTargetActionId)}`;
      return `Vote on answers: ${text(action.prompt, text(config.prompt, "Vote for your favorite answer"))}${eventText} / ${timingText}`;
    }
    if (action.type === "revealVotingResults") return `Reveal voting results / ${timingText}`;
    if (action.type === "revealAuthors") return `Reveal voting card authors / ${timingText}`;
    if (action.type === "revealVotes") return `Reveal voting card voters / ${numberValue(action.voteRevealStaggerSeconds, 1).toFixed(1)}s stagger / ${timingText}`;
    if (action.type === "revealWinningAnswer") return `Reveal winning voting card / ${timingText}`;
    if (action.type === "getPlayerAnswers") return `Get answers <- round ${text(action.round, "current")} / "${text(action.inputId, "input")}" -> ${text(action.variableName, "playerAnswers")} / ${timingText}`;
    if (action.type === "playAudio") return `Play audio URL / ${timingText}`;
    if (action.type === "playHostAudio") {
      const modeName = action.playMode === "sequence" ? "Sequence" : action.playMode === "index" ? `Index ${numberValue(action.lineIndex)}` : "Random";
      return `Play host audio: ${context.hostAudioDisplayName(action.hostAudioId)} / ${modeName} / ${timingText}`;
    }
    if (action.type === "displayText" || action.type === "text") return `${action.isShown === false ? "Hide" : "Show"} ${targetText}: "${text(action.text)}" / ${timingText}${instantText}`;
    if (action.type === "setPlayersShown") return `${action.isShown === false ? "Hide" : "Show"} players / ${timingText}${instantText}`;
    if (action.type === "setPlayerAnswersShown") return `${action.isShown === false ? "Hide" : "Show"} ${text(action.playerFilter, "all")} player answers / ${timingText}${instantText}`;
    if (action.type === "setGameObjectShown" || action.type === "setArtAssetShown") {
      const targetName = (context.gameObjectTargetName || context.artAssetTargetName)?.(action.targetLayoutElementId, action.targetLayoutScope);
      return `${action.isShown === false ? "Hide" : "Show"} ${targetName || "game object"} / ${timingText}${instantText}`;
    }
    if (action.type === "revealPlayerAnswerCorrectness") return `Reveal answer correctness / ${timingText}`;
    if (action.type === "showPoints") return `Show points for ${text(action.playerFilter, "correct")} players / ${timingText}`;
    if (action.type === "givePendingPoints") return `Bank pending points / ${timingText}`;
    if (action.type === "setTimerShown") return `${action.isShown === false ? "Hide" : "Show"} crafting timer / ${timingText}${instantText}`;
    if (action.type === "setWipeShown") return `${action.isShown === false ? "Hide" : "Show"} stage wipe / ${timingText}${instantText}`;
    if (action.type === "startCraftingTimer") return `Start crafting timer / ${timingText}`;
    if (action.type === "decision") return `${context.decisionVariableName(action.variable)}: ${context.decisionSummary(action)}`;
    if (action.type === "transition") return `Deprecated transition: ${context.transitionName(action.transition)} / ${timingText}`;
    if (action.type === "transitionState") {
      if (action.trigger === "onCountdownComplete") {
        const target = action.nextTargetActionId ? targetActionName(action.nextTargetActionId) : context.flowStateName(action.targetState);
        return `Countdown complete -> ${target} / ${timingText}`;
      }
      return `To ${context.flowStateName(action.targetState)} / ${timingText}`;
    }
    return `${text(action.text, "Text")} / ${timingText}`;
  }

  function actionTimingLabel(action: FlowAction, isSubAction = false): string {
    if (action?.type === "jumpNode" || action?.type === "labelNode" || action?.type === "codeNode") return "";
    return timingLabel(action, isSubAction, 2);
  }

  function actionValueBadge(action: FlowAction | null | undefined): FlowActionValueBadge | null {
    if (!action) return null;
    if (action.type === "jumpNode") {
      return jumpTargetIsMissing(action)
        ? { text: "\u26a0 Target", className: "is-warning" }
        : { text: "Jump", className: "is-jump" };
    }
    if (action.type === "labelNode") return { text: "Label", className: "is-label" };
    if (action.type === "codeNode") return { text: "Code", className: "is-code" };
    const visibilityActionTypes = new Set([
      "displayText",
      "presentText",
      "setPlayersShown",
      "setPlayerAnswersShown",
      "setGameObjectShown",
      "setArtAssetShown",
      "setTimerShown",
      "setWipeShown",
      "setVotingCardsShown"
    ]);
    if (!visibilityActionTypes.has(action.type)) return null;
    const isTextAction = action.type === "presentText" || action.type === "displayText";
    if (isTextAction && !action.textTarget) return { text: "\u26a0 No Field", className: "is-warning" };
    const isShown = action.isShown !== false;
    return {
      text: isShown ? "Show" : "Hide",
      className: isShown ? "is-show" : "is-hide"
    };
  }

  return { actionSummary, actionTimingLabel, actionValueBadge };
}
