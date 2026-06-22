function createFlowActionPublicRuntime({
  availableFlowTransitions,
  cleanChoiceOptions,
  flowActionTypeMeta,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeConstantInteger,
  normalizeDecisionBranches,
  normalizeDecisionValueType,
  normalizeFlowVariableName,
  normalizeHostAudioPlayMode = (value) => (value === "sequence" || value === "index" ? value : "random"),
  normalizeLineIndex = (value) => Math.max(0, Math.floor(Number(value || 0) || 0)),
  normalizePlayerFilter,
  readHostAudios = () => ({ hostAudios: [] }),
  resolveHostAudioAction = (room, action) => action,
  normalizeVotingCardFilter
}) {
  function publicFlowAction(action, index) {
    if (!action) return null;
    const timing = action.timing || { mode: "E+", seconds: 0 };
    const base = {
      index,
      id: action.id,
      name: action.name,
      actionType: action.type,
      category: action.category || flowActionTypeMeta(action.type).category,
      timing,
      nextTargetActionId: action.nextTargetActionId || "",
      subActions: (action.subActions || []).map((subAction, subActionIndex) => publicFlowAction(subAction, subActionIndex)).filter(Boolean)
    };
    if (action.type === "presentText") {
      return { ...base, type: "present", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
    }
    if (action.type === "multipleChoiceInput") {
      return {
        ...base,
        type: "multipleChoiceInput",
        prompt: action.prompt || "Answer this question by tapping an answer",
        options: cleanChoiceOptions(action.options),
        inputMode: normalizeChoiceInputMode(action.inputMode),
        locked: action.locked === true,
        timerEndTargetActionId: action.timerEndTargetActionId || "",
        answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
      };
    }
    if (action.type === "triviaInput") {
      return {
        ...base,
        type: "triviaInput",
        contentVariable: normalizeFlowVariableName(action.contentVariable),
        inputMode: normalizeChoiceInputMode(action.inputMode),
        locked: action.locked === true,
        randomizeOptions: action.randomizeOptions === true,
        timerEndTargetActionId: action.timerEndTargetActionId || "",
        answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
      };
    }
    if (action.type === "textSubmissionInput") {
      return {
        ...base,
        type: "textSubmissionInput",
        prompt: action.prompt || "Write your answer",
        placeholder: action.placeholder || "Answer here",
        characterLimit: normalizeCharacterLimit(action.characterLimit),
        timerEndTargetActionId: action.timerEndTargetActionId || "",
        answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
      };
    }
    if (action.type === "doNothing") {
      return { ...base, type: "doNothing" };
    }
    if (action.type === "playAudio") {
      return { ...base, type: "playAudio", audioUrl: action.audioUrl || "" };
    }
    if (action.type === "playHostAudio") {
      return {
        ...base,
        type: "playHostAudio",
        hostAudioId: action.hostAudioId || "",
        playMode: normalizeHostAudioPlayMode(action.playMode),
        lineIndex: normalizeLineIndex(action.lineIndex),
        audioUrl: ""
      };
    }
    if (action.type === "getRandomMultipleChoiceContent") {
      return { ...base, type: "getRandomMultipleChoiceContent", variableName: normalizeFlowVariableName(action.variableName) };
    }
    if (action.type === "prepareVotingCards") {
      return { ...base, type: "prepareVotingCards" };
    }
    if (action.type === "setVotingCardsShown") {
      return { ...base, type: "setVotingCardsShown", isShown: action.isShown !== false, instant: action.instant === true, cardFilter: normalizeVotingCardFilter(action.cardFilter) };
    }
    if (action.type === "voteOnAnswersInput") {
      return {
        ...base,
        type: "voteOnAnswersInput",
        prompt: action.prompt || "Vote for your favorite answer",
        inputMode: "submitOnce",
        timerEndTargetActionId: action.timerEndTargetActionId || "",
        answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
      };
    }
    if (action.type === "revealVotingResults") {
      return { ...base, type: "revealVotingResults" };
    }
    if (action.type === "revealAuthors") {
      return { ...base, type: "revealAuthors" };
    }
    if (action.type === "revealVotes") {
      return { ...base, type: "revealVotes", voteRevealStaggerSeconds: normalizeVoteRevealStaggerSeconds(action.voteRevealStaggerSeconds) };
    }
    if (action.type === "revealWinningAnswer") {
      return { ...base, type: "revealWinningAnswer" };
    }
    if (action.type === "displayText" || action.type === "text") {
      return { ...base, type: "displayText", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
    }
    if (action.type === "setPlayersShown") {
      return { ...base, type: "setPlayersShown", isShown: action.isShown !== false, instant: action.instant === true };
    }
    if (action.type === "setPlayerAnswersShown") {
      return { ...base, type: "setPlayerAnswersShown", isShown: action.isShown !== false, instant: action.instant === true, playerFilter: normalizePlayerFilter(action.playerFilter) };
    }
    if (action.type === "revealPlayerAnswerCorrectness") {
      return { ...base, type: "revealPlayerAnswerCorrectness" };
    }
    if (action.type === "showPoints") {
      return { ...base, type: "showPoints", playerFilter: normalizePlayerFilter(action.playerFilter || "correct"), points: normalizeConstantInteger(action.points, 0, 0, 999999) };
    }
    if (action.type === "givePendingPoints") {
      return { ...base, type: "givePendingPoints" };
    }
    if (action.type === "setTimerShown") {
      return { ...base, type: "setTimerShown", isShown: action.isShown !== false, instant: action.instant === true };
    }
    if (action.type === "startCraftingTimer") {
      return {
        ...base,
        type: "startCraftingTimer"
      };
    }
    if (action.type === "decision") {
      return {
        ...base,
        type: "decision",
        variable: action.variable || "activePlayerCount",
        valueType: normalizeDecisionValueType(action.valueType),
        branches: normalizeDecisionBranches(action)
      };
    }
    if (action.type === "transition") {
      const transition = availableFlowTransitions.find((item) => item.id === action.transition) || availableFlowTransitions[0];
      return { ...base, type: "transition", transition: transition.id, transitionName: transition.name };
    }
    if (action.type === "transitionState") {
      return { ...base, type: "transitionState", targetState: action.targetState, trigger: action.trigger || "" };
    }
    return { ...base, type: "displayText", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
  }

  function resolveRoomActionText(action, room) {
    if (!action) return null;
    const resolved = {
      ...action,
      text: typeof action.text === "string" ? action.text.replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1)) : action.text,
      prompt: typeof action.prompt === "string" ? action.prompt.replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1)) : action.prompt,
      options: Array.isArray(action.options) ? action.options.map((option) => String(option).replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1))) : action.options,
      subActions: (action.subActions || []).map((subAction) => resolveRoomActionText(subAction, room)).filter(Boolean)
    };
    if (resolved.type === "playHostAudio") {
      return resolveHostAudioAction(room, resolved, readHostAudios());
    }
    return resolved;
  }

  function roundNumberWord(value) {
    const number = Math.max(1, Math.floor(Number(value) || 1));
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
    if (number < words.length) return words[number];
    return String(number);
  }

  function normalizeVoteRevealStaggerSeconds(value) {
    const number = Number(value);
    return Number(Math.max(0, Math.min(60, Number.isFinite(number) ? number : 1)).toFixed(2));
  }

  return {
    publicFlowAction,
    resolveRoomActionText
  };
}

module.exports = { createFlowActionPublicRuntime };
