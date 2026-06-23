(function () {
  "use strict";

  function createActionSummary(context) {
    function jumpTargetIsMissing(action) {
      const target = String(action?.jumpTargetActionId || "").toLowerCase();
      return !target || target === "none";
    }

    function actionSummary(action, isSubAction = false) {
      if (action.type === "jumpNode") {
        return jumpTargetIsMissing(action)
          ? "⚠ Jump target required"
          : `Jump -> ${context.flowTargetActionName(action.jumpTargetActionId)}`;
      }
      const timing = context.ensureActionTiming(action, isSubAction);
      const timingText = `${timing.mode} ${Number(timing.seconds || 0).toFixed(1)}s`;
      const targetText = action.textTarget ? context.textTargetName(action.textTarget) : "⚠ No Field";
      const instantText = action.instant ? " / Instant" : "";
      if (action.type === "presentText") {
        const eventText = ` / click: ${context.flowTargetActionName(action.stageClickTargetActionId || action.nextTargetActionId)}`;
        return `${action.isShown === false ? "Hide" : "Show"} ${targetText}: "${action.text || ""}"${eventText} / ${timingText}${instantText}`;
      }
      if (action.type === "multipleChoiceInput") {
        const modeName = action.inputMode === "submitOnce" ? "Submit Once" : action.inputMode === "continuous" ? "Continuous" : "Single Select";
        const lockedText = action.inputMode === "singleSelect" && action.locked ? " / Locked" : "";
        const eventText = ` / timer: ${context.flowTargetActionName(action.timerEndTargetActionId)} / answers: ${context.flowTargetActionName(action.answersSubmittedTargetActionId)}`;
        return `${modeName}${lockedText}: ${action.prompt || "Choice input"} / ${(action.options || []).length || 0} options${eventText} / ${timingText}`;
      }
      if (action.type === "getRandomMultipleChoiceContent") return `Get random prompt -> ${action.variableName || "multipleChoicePrompt"} / ${timingText}`;
      if (action.type === "triviaInput") {
        const modeName = action.inputMode === "singleSelect" ? "Single Select" : action.inputMode === "continuous" ? "Continuous" : "Submit Once";
        const randomText = action.randomizeOptions ? " / Randomized" : "";
        const eventText = ` / timer: ${context.flowTargetActionName(action.timerEndTargetActionId)} / answers: ${context.flowTargetActionName(action.answersSubmittedTargetActionId)}`;
        return `Trivia from ${action.contentVariable || "multipleChoicePrompt"} / ${modeName}${randomText}${eventText} / ${timingText}`;
      }
      if (action.type === "textSubmissionInput") {
        const limitText = Number(action.characterLimit || 0) > 0 ? ` / ${Number(action.characterLimit)} chars` : "";
        const eventText = ` / timer: ${context.flowTargetActionName(action.timerEndTargetActionId)} / answers: ${context.flowTargetActionName(action.answersSubmittedTargetActionId)}`;
        return `Text Submit: ${action.prompt || "Write your answer"}${limitText} / Stage validates${eventText} / ${timingText}`;
      }
      if (action.type === "voiceSubmissionInput") {
        const limitText = Number(action.characterLimit || 0) > 0 ? ` / ${Number(action.characterLimit)} chars` : "";
        const eventText = ` / timer: ${context.flowTargetActionName(action.timerEndTargetActionId)} / answers: ${context.flowTargetActionName(action.answersSubmittedTargetActionId)}`;
        return `VIP Voice Submit: ${action.prompt || "Say your answer"}${limitText} / Transcript stored as text${eventText} / ${timingText}`;
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
        const eventText = ` / timer: ${context.flowTargetActionName(action.timerEndTargetActionId)} / votes: ${context.flowTargetActionName(action.answersSubmittedTargetActionId)}`;
        return `Vote on answers: ${action.prompt || "Vote for your favorite answer"}${eventText} / ${timingText}`;
      }
      if (action.type === "revealVotingResults") return `Reveal voting results / ${timingText}`;
      if (action.type === "revealAuthors") return `Reveal voting card authors / ${timingText}`;
      if (action.type === "revealVotes") return `Reveal voting card voters / ${Number(action.voteRevealStaggerSeconds ?? 1).toFixed(1)}s stagger / ${timingText}`;
      if (action.type === "revealWinningAnswer") return `Reveal winning voting card / ${timingText}`;
      if (action.type === "getPlayerAnswers") return `Get answers ← round ${action.round || "current"} / "${action.inputId || "input"}" → ${action.variableName || "playerAnswers"} / ${timingText}`;
      if (action.type === "playAudio") return `Play audio URL / ${timingText}`;
      if (action.type === "playHostAudio") {
        const modeName = action.playMode === "sequence" ? "Sequence" : action.playMode === "index" ? `Index ${Number(action.lineIndex || 0)}` : "Random";
        return `Play host audio: ${context.hostAudioDisplayName(action.hostAudioId)} / ${modeName} / ${timingText}`;
      }
      if (action.type === "displayText" || action.type === "text") return `${action.isShown === false ? "Hide" : "Show"} ${targetText}: "${action.text || ""}" / ${timingText}${instantText}`;
      if (action.type === "setPlayersShown") return `${action.isShown === false ? "Hide" : "Show"} players / ${timingText}${instantText}`;
      if (action.type === "setPlayerAnswersShown") return `${action.isShown === false ? "Hide" : "Show"} ${action.playerFilter || "all"} player answers / ${timingText}${instantText}`;
      if (action.type === "revealPlayerAnswerCorrectness") return `Reveal answer correctness / ${timingText}`;
      if (action.type === "showPoints") return `Show points for ${action.playerFilter || "correct"} players / ${timingText}`;
      if (action.type === "givePendingPoints") return `Bank pending points / ${timingText}`;
      if (action.type === "setTimerShown") return `${action.isShown === false ? "Hide" : "Show"} crafting timer / ${timingText}${instantText}`;
      if (action.type === "setWipeShown") return `${action.isShown === false ? "Hide" : "Show"} stage wipe / ${timingText}${instantText}`;
      if (action.type === "startCraftingTimer") return `Start crafting timer / ${timingText}`;
      if (action.type === "decision") return `${context.decisionVariableName(action.variable)}: ${context.decisionSummary(action)}`;
      if (action.type === "transition") return `Deprecated transition: ${context.transitionName(action.transition)} / ${timingText}`;
      if (action.type === "transitionState") {
        if (action.trigger === "onCountdownComplete") {
          const target = action.nextTargetActionId ? context.flowTargetActionName(action.nextTargetActionId) : context.flowStateName(action.targetState);
          return `Countdown complete -> ${target} / ${timingText}`;
        }
        return `To ${context.flowStateName(action.targetState)} / ${timingText}`;
      }
      return `${action.text || "Text"} / ${timingText}`;
    }

    function actionTimingLabel(action, isSubAction = false) {
      if (action?.type === "jumpNode") return "";
      const timing = context.ensureActionTiming(action, isSubAction);
      return `${timing.mode} ${Number(timing.seconds || 0).toFixed(2)}s`;
    }

    function actionValueBadge(action) {
      if (!action) return null;
      if (action.type === "jumpNode") {
        return jumpTargetIsMissing(action)
          ? { text: "⚠ Target", className: "is-warning" }
          : { text: "Jump", className: "is-jump" };
      }
      const visibilityActionTypes = new Set([
        "displayText",
        "presentText",
        "setPlayersShown",
        "setPlayerAnswersShown",
        "setTimerShown",
        "setWipeShown",
        "setVotingCardsShown"
      ]);
      if (!visibilityActionTypes.has(action.type)) return null;
      const isTextAction = action.type === "presentText" || action.type === "displayText";
      if (isTextAction && !action.textTarget) {
        return { text: "⚠ No Field", className: "is-warning" };
      }
      const isShown = action.isShown !== false;
      return {
        text: isShown ? "Show" : "Hide",
        className: isShown ? "is-show" : "is-hide"
      };
    }

    return {
      actionValueBadge,
      actionSummary,
      actionTimingLabel
    };
  }

  window.PartyGameFlowActionSummary = { createActionSummary };
})();
