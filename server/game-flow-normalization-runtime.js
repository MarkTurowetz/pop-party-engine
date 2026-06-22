function createGameFlowNormalizationRuntime({
  availableFlowActionTypes,
  availableFlowTransitions,
  cleanChoiceOptions,
  cleanFlowText,
  defaultGameFlow,
  flowActionTarget,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeConstantInteger,
  normalizeDecisionBranches,
  normalizeDecisionValueType,
  normalizeFlowId,
  normalizeFlowVariableName,
  normalizeHostAudioPlayMode = (value) => (value === "sequence" || value === "index" ? value : "random"),
  normalizeLineIndex = (value) => Math.max(0, Math.floor(Number(value || 0) || 0)),
  normalizePlayerFilter,
  normalizeVotingCardFilter
}) {
  function normalizeGameFlow(flow) {
    const incomingStates = Array.isArray(flow?.states) ? flow.states : defaultGameFlow.states;
    const states = incomingStates.map((state, stateIndex) => {
      const fallbackStateId = stateIndex === 0 ? "lobby" : `state-${stateIndex + 1}`;
      const id = normalizeFlowId(state.id || state.name, fallbackStateId);
      const actions = Array.isArray(state.actions) ? state.actions : [];
      return {
        id,
        name: cleanFlowText(state.name, id),
        nodePosition: normalizeNodePosition(state.nodePosition, stateIndex),
        startNodePosition: normalizeNodePosition(state.startNodePosition, 0),
        returnNodePosition: normalizeNodePosition(state.returnNodePosition, 0),
        entryTargetActionId: flowActionTarget(state.entryTargetActionId),
        nextStateTargetId: normalizeFlowId(state.nextStateTargetId, ""),
        actions: actions.map((action, actionIndex) => normalizeFlowAction(action, actionIndex, id)).filter(Boolean)
      };
    });
    if (!states.some((state) => state.id === "lobby")) {
      states.unshift(defaultGameFlow.states[0]);
    }
    return { states };
  }

  function normalizeNodePosition(position, index = 0) {
    if (!position || typeof position !== "object") return null;
    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: Math.round(Math.max(-5000, Math.min(15000, x))),
      y: Math.round(Math.max(-5000, Math.min(15000, y)))
    };
  }

  function flowActionTypeMeta(type) {
    return availableFlowActionTypes.find((item) => item.id === type) || availableFlowActionTypes[0];
  }

  function normalizeFlowAction(action, actionIndex, stateId, isSubAction = false) {
    const requestedType = action?.type === "text" ? "displayText" : action?.type;
    const type = availableFlowActionTypes.some((item) => item.id === requestedType) ? requestedType : "presentText";
    const category = flowActionTypeMeta(type).category;
    const fallbackId = `${stateId}-${isSubAction ? "sub-action" : "action"}-${actionIndex + 1}`;
    const base = {
      id: normalizeFlowId(action?.id || action?.name, fallbackId),
      name: cleanFlowText(action?.name, `Action ${actionIndex + 1}`),
      type,
      category,
      timing: normalizeActionTiming(action?.timing, category !== "input", isSubAction),
      nextTargetActionId: flowActionTarget(action?.nextTargetActionId),
      nodePosition: normalizeNodePosition(action?.nodePosition, actionIndex),
      subActions: normalizeSubActions(action?.subActions, stateId)
    };
    if (type === "presentText") {
      return {
        ...base,
        text: cleanFlowText(action?.text, "Presented text"),
        textTarget: normalizeTextTarget(action?.textTarget),
        isShown: action?.isShown !== false,
        instant: action?.instant === true
      };
    }
    if (type === "multipleChoiceInput") {
      return {
        ...base,
        prompt: cleanFlowText(action?.prompt, "Answer this question by tapping an answer"),
        options: cleanChoiceOptions(action?.options),
        inputMode: normalizeChoiceInputMode(action?.inputMode),
        locked: action?.locked === true,
        timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
        answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
      };
    }
    if (type === "triviaInput") {
      return {
        ...base,
        contentVariable: normalizeFlowVariableName(action?.contentVariable),
        inputMode: normalizeChoiceInputMode(action?.inputMode),
        locked: action?.locked === true,
        randomizeOptions: action?.randomizeOptions === true,
        timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
        answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
      };
    }
    if (type === "textSubmissionInput") {
      const characterLimit = normalizeCharacterLimit(action?.characterLimit);
      return {
        ...base,
        prompt: cleanFlowText(action?.prompt, "Write your answer"),
        placeholder: cleanFlowText(action?.placeholder, "Answer here"),
        characterLimit,
        timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
        answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
      };
    }
    if (type === "doNothing") {
      return { ...base };
    }
    if (type === "playAudio") {
      return {
        ...base,
        audioUrl: cleanFlowText(action?.audioUrl, "")
      };
    }
    if (type === "playHostAudio") {
      return {
        ...base,
        hostAudioId: normalizeFlowId(action?.hostAudioId, ""),
        playMode: normalizeHostAudioPlayMode(action?.playMode),
        lineIndex: normalizeLineIndex(action?.lineIndex)
      };
    }
    if (type === "getRandomMultipleChoiceContent") {
      return {
        ...base,
        variableName: normalizeFlowVariableName(action?.variableName)
      };
    }
    if (type === "prepareVotingCards") {
      return { ...base };
    }
    if (type === "setVotingCardsShown") {
      return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true, cardFilter: normalizeVotingCardFilter(action?.cardFilter) };
    }
    if (type === "voteOnAnswersInput") {
      return {
        ...base,
        prompt: cleanFlowText(action?.prompt, "Vote for your favorite answer"),
        inputMode: "submitOnce",
        timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
        answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
      };
    }
    if (type === "revealVotingResults") {
      return { ...base };
    }
    if (type === "displayText") {
      return {
        ...base,
        text: cleanFlowText(action?.text, "Displayed text"),
        textTarget: normalizeTextTarget(action?.textTarget),
        isShown: action?.isShown !== false,
        instant: action?.instant === true
      };
    }
    if (type === "setPlayersShown") {
      return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true };
    }
    if (type === "setPlayerAnswersShown") {
      return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true, playerFilter: normalizePlayerFilter(action?.playerFilter) };
    }
    if (type === "revealPlayerAnswerCorrectness") {
      return { ...base };
    }
    if (type === "showPoints") {
      return { ...base, playerFilter: normalizePlayerFilter(action?.playerFilter || "correct"), points: normalizeConstantInteger(action?.points, 0, 0, 999999) };
    }
    if (type === "givePendingPoints") {
      return { ...base };
    }
    if (type === "setTimerShown") {
      return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true };
    }
    if (type === "startCraftingTimer") {
      return { ...base };
    }
    if (type === "decision") {
      return {
        ...base,
        variable: cleanFlowText(action?.variable, "activePlayerCount"),
        valueType: normalizeDecisionValueType(action?.valueType),
        branches: normalizeDecisionBranches(action)
      };
    }
    if (type === "transition") {
      const transition = availableFlowTransitions.some((item) => item.id === action?.transition) ? action.transition : "horizontalWipe";
      return { ...base, transition };
    }
    if (type === "transitionState") {
      return {
        ...base,
        trigger: action?.trigger === "onCountdownComplete" ? "onCountdownComplete" : "",
        targetState: normalizeFlowId(action?.targetState, "intro")
      };
    }
    return {
      ...base,
      text: cleanFlowText(action?.text, "Text"),
      textTarget: normalizeTextTarget(action?.textTarget),
      isShown: action?.isShown !== false,
      instant: action?.instant === true
    };
  }

  function normalizeTextTarget(value) {
    const target = normalizeFlowId(value || "presentation", "presentation");
    return target || "presentation";
  }

  function normalizeSubActions(subActions, stateId) {
    if (!Array.isArray(subActions)) return [];
    return subActions.map((subAction, subActionIndex) => normalizeFlowAction(subAction, subActionIndex, stateId, true)).filter(Boolean);
  }

  function normalizeActionTiming(timing, allowStartTiming = true, preferStartTiming = false) {
    const mode = preferStartTiming || (allowStartTiming && timing?.mode === "S+") ? "S+" : "E+";
    const rawSeconds = Number(timing?.seconds || 0);
    const seconds = Number(Math.max(0, Math.min(999, Number.isFinite(rawSeconds) ? rawSeconds : 0)).toFixed(2));
    return { mode, seconds };
  }

  return {
    flowActionTypeMeta,
    normalizeActionTiming,
    normalizeFlowAction,
    normalizeGameFlow,
    normalizeNodePosition,
    normalizeTextTarget
  };
}

module.exports = { createGameFlowNormalizationRuntime };
