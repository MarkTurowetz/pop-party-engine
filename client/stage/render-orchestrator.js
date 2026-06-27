(function attachPartyGameStageRenderOrchestrator(global) {
  "use strict";

  function actionKeyForLobby(lobby = {}) {
    const phase = lobby.phase || "lobby";
    const action = lobby.action || {};
    return `${phase}:${action.id || action.index || ""}:${action.type || ""}`;
  }

  function isPresentedTextAction(action) {
    return action && ["present", "presentText"].includes(action.type);
  }

  class StageRenderOrchestrator {
    constructor(options = {}) {
      this.options = options;
      this.renderedActionKey = "";
      this.renderedPhase = "";
      this.renderedAction = null;
    }

    actionKey() {
      return this.renderedActionKey;
    }

    phase() {
      return this.renderedPhase;
    }

    render(lobby = {}) {
      const options = this.options;
      const nextPhase = lobby.phase || "lobby";
      const actionKey = actionKeyForLobby(lobby);
      const isNewAction = this.renderedActionKey !== actionKey;
      const isNewPhase = Boolean(this.renderedPhase && this.renderedPhase !== nextPhase);
      const haltedByDecision = lobby.lastDecisionTrace?.selectedTarget === "none";
      const previousAction = this.renderedAction;
      const nextAction = lobby.action || null;

      if (isNewPhase) {
        options.clearStageAudioPlayers?.();
        options.clearPointPopups?.();
        options.renderVotingCards?.([]);
      }

      this.renderedPhase = nextPhase;
      if (isNewAction) options.prepareNewStageAction?.(lobby, actionKey);
      if (isNewAction && isPresentedTextAction(previousAction)) {
        const previousTarget = previousAction.textTarget || "presentation";
        const nextTarget = nextAction?.textTarget || "presentation";
        if (!isPresentedTextAction(nextAction) || nextTarget !== previousTarget) {
          options.setStageTextObject?.(previousTarget, {
            isShown: false,
            instant: previousAction.instant === true
          });
        }
      }

      if (haltedByDecision) {
        options.cancelStageWipe?.();
        options.showStageDecisionHalt?.(lobby);
        this.renderedActionKey = actionKey;
        this.renderedAction = null;
        options.applyStageState?.({ ...lobby, action: null });
        return;
      }

      if (lobby.action?.type === "transition" && isNewAction) {
        this.renderedActionKey = actionKey;
        this.renderedAction = lobby.action || null;
        options.scheduleSubActions?.(lobby.action, actionKey);
        options.runStageWipe?.(() => {
          options.applyStageState?.(lobby);
          options.completeFlowAction?.("callback", lobby.action.id);
        });
        return;
      }

      this.renderedActionKey = actionKey;
      this.renderedAction = lobby.action || null;
      options.applyStageState?.(lobby);
      if (isNewAction) options.runStageAction?.(lobby.action, true, actionKey);
    }
  }

  global.PartyGameStageRenderOrchestrator = {
    actionKeyForLobby,
    createOrchestrator: (options) => new StageRenderOrchestrator(options),
    StageRenderOrchestrator
  };
})(window);
