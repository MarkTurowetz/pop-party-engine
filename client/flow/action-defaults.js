(function () {
  "use strict";

  function createActionDefaults(context) {
    function firstHostAudioId() {
      return typeof context.firstHostAudioId === "function" ? context.firstHostAudioId() : "";
    }

    function applyActionTypeDefaults(action, value, isSubAction = false) {
      action.type = value;
      if (value === "presentText") {
        action.text = action.text || "Presented text";
        if (!("textTarget" in action)) action.textTarget = "";
        action.stageClickTargetActionId = action.stageClickTargetActionId || action.nextTargetActionId || action.nextTargetNodeId || "";
      }
      const choiceInputConfig = globalThis.PartyChoiceInputActions?.choiceInputActionConfig?.(value);
      if (value === "multipleChoiceInput") {
        action.prompt = action.prompt || choiceInputConfig?.prompt || "Answer this question by tapping an answer";
        action.options = Array.isArray(action.options) && action.options.length ? action.options : ["A", "B", "C", "D"];
        action.inputMode = action.inputMode || "singleSelect";
        action.locked = action.locked === true;
        action.timerEndTargetActionId = action.timerEndTargetActionId || "";
        action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
      }
      if (value === "getRandomMultipleChoiceContent") {
        action.variableName = action.variableName || "multipleChoicePrompt";
      }
      if (value === "triviaInput") {
        action.contentVariable = action.contentVariable || "multipleChoicePrompt";
        action.prompt = action.prompt || choiceInputConfig?.prompt || "Answer this question by tapping an answer";
        action.inputMode = action.inputMode || choiceInputConfig?.inputMode || "submitOnce";
        action.locked = action.locked === true;
        action.randomizeOptions = action.randomizeOptions === true;
        action.timerEndTargetActionId = action.timerEndTargetActionId || "";
        action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
      }
      const textAnswerConfig = globalThis.PartyTextAnswerActions?.textAnswerActionConfig?.(value);
      if (textAnswerConfig) {
        action.prompt = action.prompt || textAnswerConfig.prompt;
        action.placeholder = action.placeholder || textAnswerConfig.placeholder;
        action.characterLimit = Number(action.characterLimit || 0);
        action.timerEndTargetActionId = action.timerEndTargetActionId || "";
        action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
      }
      if (value === "setVotingCardsShown") {
        action.isShown = action.isShown !== false;
        action.instant = action.instant === true;
        action.cardFilter = action.cardFilter || "all";
      }
      if (value === "voteOnAnswersInput") {
        action.prompt = action.prompt || choiceInputConfig?.prompt || "Vote for your favorite answer";
        action.timerEndTargetActionId = action.timerEndTargetActionId || "";
        action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
      }
      if (value === "revealVotes") {
        action.voteRevealStaggerSeconds = Number(action.voteRevealStaggerSeconds ?? 1);
      }
      if (value === "displayText") {
        action.text = action.text || "Displayed text";
        if (!("textTarget" in action)) action.textTarget = "";
      }
      if (value === "getPlayerAnswers") {
        action.inputId = action.inputId || "input";
        action.round = action.round || "current";
        action.variableName = action.variableName || "playerAnswers";
      }
      if (value === "playAudio") action.audioUrl = action.audioUrl || "";
      if (value === "playHostAudio") {
        action.hostAudioId = action.hostAudioId || firstHostAudioId();
        action.playMode = action.playMode || "random";
        action.lineIndex = Math.max(0, Math.floor(Number(action.lineIndex || 0)));
      }
      if (value === "presentText" || value === "displayText" || value === "text" || value === "setPlayersShown" || value === "setPlayerAnswersShown") action.isShown = action.isShown !== false;
      if (value === "setPlayerAnswersShown" || value === "showPoints") action.playerFilter = action.playerFilter || (value === "showPoints" ? "correct" : "all");
      if (value === "showPoints") action.points = Math.max(0, Math.floor(Number(action.points || 0)));
      if (value === "setTimerShown") action.isShown = action.isShown !== false;
      if (value === "setWipeShown") {
        action.isShown = action.isShown !== false;
        action.instant = action.instant === true;
      }
      if (value === "jumpNode") {
        action.jumpTargetActionId = action.jumpTargetActionId || "none";
        action.nextTargetActionId = "";
        action.timing = { mode: "E+", seconds: 0 };
        action.subActions = [];
      }
      if (value === "decision") {
        action.variable = action.variable || "activePlayerCount";
        action.valueType = action.valueType || "int";
        context.ensureDecisionBranches?.(action);
      }
      if (value === "transition") action.transition = action.transition || "horizontalWipe";
      if (value === "transitionState") action.targetState = action.targetState || "intro";
      if (value === "presentText" || value === "displayText" || value === "text") action.textTarget = action.textTarget || "presentation";
      if (value !== "jumpNode") context.ensureActionTiming?.(action, isSubAction);
    }

    return { applyActionTypeDefaults };
  }

  window.PartyGameFlowActionDefaults = { createActionDefaults };
})();
