(function () {
  "use strict";

  function completeAfter(action, runtime, delayMs) {
    window.setTimeout(() => {
      if (!runtime.isCurrent()) return;
      runtime.complete(action);
    }, Math.max(0, Number(delayMs || 0)));
  }

  const fallbackRunnerDefinitions = [
    { type: "doNothing", runner: "immediateComplete" },
    { type: "jumpNode", runner: "immediateComplete" },
    { type: "playAudio", runner: "playAudio" },
    { type: "playHostAudio", runner: "playAudio" },
    { type: "getRandomMultipleChoiceContent", runner: "serverEffect" },
    { type: "prepareVotingCards", runner: "serverEffect" },
    { type: "setVotingCardsShown", runner: "serverEffect" },
    { type: "revealVotingResults", runner: "votingReveal" },
    { type: "revealAuthors", runner: "votingReveal" },
    { type: "revealVotes", runner: "votingReveal" },
    { type: "revealWinningAnswer", runner: "votingReveal" },
    { type: "setupGame", runner: "serverEffect" },
    { type: "getPlayerAnswers", runner: "serverEffect" },
    { type: "present", runner: "displayText" },
    { type: "displayText", runner: "displayText" },
    { type: "setPlayersShown", runner: "setPlayersShown" },
    { type: "setPlayerAnswersShown", runner: "setPlayerAnswersShown" },
    { type: "setArtAssetShown", runner: "setArtAssetShown" },
    { type: "revealPlayerAnswerCorrectness", runner: "delayedComplete", delayMs: 250 },
    { type: "showPoints", runner: "delayedComplete", delayMs: 1500 },
    { type: "givePendingPoints", runner: "serverEffect" },
    { type: "setTimerShown", runner: "setTimerShown" },
    { type: "setWipeShown", runner: "setWipeShown" },
    { type: "setControllerLayout", runner: "serverEffect" },
    { type: "startCraftingTimer", runner: "serverEffect" },
    { type: "transition", runner: "transition" },
    { type: "transitionState", runner: "immediateComplete" },
    { type: "text", runner: "immediateComplete" }
  ];

  function runnerDefinitions() {
    const sharedDefinitions = window.PartyGameFlowActionRegistry?.stageActionRunnerDefinitions;
    return Array.isArray(sharedDefinitions) && sharedDefinitions.length
      ? sharedDefinitions
      : fallbackRunnerDefinitions;
  }

  function createBehaviorHandlers(context) {
    return {
      immediateComplete(action, runtime) {
        if (runtime.isPrimary) runtime.complete(action);
      },
      playAudio(action, runtime) {
        context.playStageAudioAction(action, runtime.isPrimary, runtime.actionKey);
      },
      serverEffect(action, runtime) {
        if (runtime.isPrimary) runtime.complete(action);
        else runtime.applyEffect(action);
      },
      votingReveal(action, runtime) {
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, context.voteRevealDurationMs(action));
      },
      delayedComplete(action, runtime, definition) {
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, definition.delayMs);
      },
      setPlayersShown(action, runtime) {
        const duration = context.setPlayersShownForAction
          ? context.setPlayersShownForAction(action)
          : 0;
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, duration);
      },
      setPlayerAnswersShown(action, runtime) {
        const existingDuration = context.playerAnswerBubbleAnimationRemaining();
        const duration = action.playerFilter && action.playerFilter !== "all"
          ? (action.instant ? 0 : 500)
          : Math.max(
              context.setPlayerAnswerBubblesShown(action.isShown !== false, { instant: action.instant === true }),
              existingDuration
            );
        if (!runtime.isPrimary) runtime.applyEffect(action);
        if (runtime.isPrimary) completeAfter(action, runtime, duration);
      },
      setArtAssetShown(action, runtime) {
        const duration = context.setStageLayoutArtElementShownForAction
          ? context.setStageLayoutArtElementShownForAction(action)
          : 0;
        if (runtime.isPrimary) completeAfter(action, runtime, duration);
      },
      setTimerShown(action, runtime) {
        const duration = context.setCraftingTimerShownForAction
          ? context.setCraftingTimerShownForAction(action, { actionKey: runtime.actionKey })
          : (action.isShown === false && action.instant !== true ? 500 : 0);
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, duration);
      },
      setWipeShown(action, runtime) {
        const duration = context.setStageWipeShownForAction
          ? context.setStageWipeShownForAction(action, { actionKey: runtime.actionKey })
          : 0;
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, duration);
      },
      displayText(action, runtime) {
        context.setStageTextObject(action.textTarget || "presentation", {
          text: action.text || "",
          isShown: action.isShown !== false,
          instant: action.instant === true,
          complete: runtime.isPrimary && action.type === "displayText"
            ? () => {
                if (!runtime.isCurrent()) return;
                runtime.complete(action);
              }
            : null
        });
      },
      transition(action, runtime) {
        if (!runtime.isPrimary) context.runStageWipe(() => {});
      }
    };
  }

  function createHandlerRegistry(context) {
    const behaviorHandlers = createBehaviorHandlers(context);
    const handlers = new Map();
    for (const definition of runnerDefinitions()) {
      const behavior = behaviorHandlers[definition.runner];
      if (!definition.type || !behavior) continue;
      handlers.set(definition.type, (action, runtime) => behavior(action, runtime, definition));
    }
    if (!handlers.has("text")) {
      handlers.set("text", behaviorHandlers.immediateComplete);
    }
    return handlers;
  }

  function createRunner(context) {
    const handlers = createHandlerRegistry(context);

    function run(action, runtimeOptions) {
      const runtime = {
        ...runtimeOptions,
        applyEffect: (targetAction) => context.applyFlowActionEffect(targetAction.id),
        complete: (targetAction) => context.completeFlowAction("callback", targetAction.id),
        isCurrent: () => context.isCurrentActionKey(runtimeOptions.actionKey)
      };
      const handler = handlers.get(action?.type);
      if (handler) handler(action, runtime);
    }

    return { run };
  }

  window.PartyGameStageActionRunners = { createRunner };
})();
