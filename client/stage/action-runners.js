(function () {
  "use strict";

  function primaryServerEffect(action, runtime) {
    runtime.complete(action);
  }

  function subActionServerEffect(action, runtime) {
    runtime.applyEffect(action);
  }

  function completeOrApplyEffect(action, runtime) {
    if (runtime.isPrimary) primaryServerEffect(action, runtime);
    else subActionServerEffect(action, runtime);
  }

  function completeAfter(action, runtime, delayMs) {
    window.setTimeout(() => {
      if (!runtime.isCurrent()) return;
      runtime.complete(action);
    }, Math.max(0, Number(delayMs || 0)));
  }

  function createRunner(context) {
    const handlers = {
      doNothing(action, runtime) {
        if (runtime.isPrimary) runtime.complete(action);
      },
      playAudio(action, runtime) {
        context.playStageAudioAction(action, runtime.isPrimary, runtime.actionKey);
      },
      playHostAudio(action, runtime) {
        context.playStageAudioAction(action, runtime.isPrimary, runtime.actionKey);
      },
      getRandomMultipleChoiceContent: completeOrApplyEffect,
      prepareVotingCards: completeOrApplyEffect,
      setVotingCardsShown: completeOrApplyEffect,
      revealVotingResults(action, runtime) {
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, context.voteRevealDurationMs(action));
      },
      revealAuthors(action, runtime) {
        handlers.revealVotingResults(action, runtime);
      },
      revealVotes(action, runtime) {
        handlers.revealVotingResults(action, runtime);
      },
      revealWinningAnswer(action, runtime) {
        handlers.revealVotingResults(action, runtime);
      },
      revealPlayerAnswerCorrectness(action, runtime) {
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, 250);
      },
      showPoints(action, runtime) {
        if (!runtime.isPrimary) {
          runtime.applyEffect(action);
          return;
        }
        completeAfter(action, runtime, 1500);
      },
      givePendingPoints: completeOrApplyEffect,
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
      startCraftingTimer: completeOrApplyEffect,
      present(action, runtime) {
        handlers.displayText(action, runtime);
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
      },
      transitionState(action, runtime) {
        if (runtime.isPrimary) runtime.complete(action);
      },
      text(action, runtime) {
        if (runtime.isPrimary) runtime.complete(action);
      }
    };

    function run(action, runtimeOptions) {
      const runtime = {
        ...runtimeOptions,
        applyEffect: (targetAction) => context.applyFlowActionEffect(targetAction.id),
        complete: (targetAction) => context.completeFlowAction("callback", targetAction.id),
        isCurrent: () => context.isCurrentActionKey(runtimeOptions.actionKey)
      };
      const handler = handlers[action?.type];
      if (handler) handler(action, runtime);
    }

    return { run };
  }

  window.PartyGameStageActionRunners = { createRunner };
})();
