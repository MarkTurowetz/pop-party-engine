(function attachPartyGameStageRenderOrchestrator(global) {
  "use strict";

  function actionKeyForLobby(lobby = {}) {
    const phase = lobby.phase || "lobby";
    const action = lobby.action || {};
    return `${phase}:${action.id || action.index || ""}:${action.type || ""}`;
  }

  class StageRenderOrchestrator {
    constructor(options = {}) {
      this.options = options;
      this.renderedActionKey = "";
      this.renderedPhase = "";
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

      if (isNewPhase) {
        options.clearStageAudioPlayers?.();
        options.clearPointPopups?.();
        options.renderVotingCards?.([]);
      }

      this.renderedPhase = nextPhase;
      if (isNewAction) options.prepareNewStageAction?.(lobby, actionKey);

      if (haltedByDecision) {
        options.cancelStageWipe?.();
        options.showStageDecisionHalt?.(lobby);
        this.renderedActionKey = actionKey;
        options.applyStageState?.({ ...lobby, action: null });
        return;
      }

      if (lobby.action?.type === "transition" && isNewAction) {
        this.renderedActionKey = actionKey;
        options.scheduleSubActions?.(lobby.action, actionKey);
        options.runStageWipe?.(() => {
          options.applyStageState?.(lobby);
          options.completeFlowAction?.("callback", lobby.action.id);
        });
        return;
      }

      this.renderedActionKey = actionKey;
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
