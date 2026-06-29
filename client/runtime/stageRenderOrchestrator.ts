// Typed port of the legacy client/stage/render-orchestrator.js IIFE. Installs
// window.PartyGameStageRenderOrchestrator for the legacy stage runtime.

type Dict = Record<string, unknown>;

interface OrchestratorOptions {
  clearStageAudioPlayers?: () => void;
  clearPointPopups?: () => void;
  renderVotingCards?: (cards: unknown[]) => void;
  prepareNewStageAction?: (lobby: Dict, actionKey: string) => void;
  setStageTextObject?: (target: string, spec: Dict) => void;
  cancelStageWipe?: () => void;
  showStageDecisionHalt?: (lobby: Dict) => void;
  applyStageState?: (lobby: Dict) => void;
  scheduleSubActions?: (action: Dict, actionKey: string) => void;
  runStageWipe?: (callback: () => void) => void;
  completeFlowAction?: (kind: string, actionId: unknown) => void;
  runStageAction?: (action: Dict | null, immediate: boolean, actionKey: string) => void;
}

function actionKeyForLobby(lobby: Dict = {}): string {
  const phase = (lobby.phase as string) || "lobby";
  const action = (lobby.action as Dict) || {};
  return `${phase}:${action.id || action.index || ""}:${action.type || ""}`;
}

function isPresentedTextAction(action: Dict | null): boolean {
  return Boolean(action && ["present", "presentText"].includes(action.type as string));
}

class StageRenderOrchestrator {
  options: OrchestratorOptions;
  renderedActionKey = "";
  renderedPhase = "";
  renderedAction: Dict | null = null;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;
  }

  actionKey(): string {
    return this.renderedActionKey;
  }

  phase(): string {
    return this.renderedPhase;
  }

  render(lobby: Dict = {}): void {
    const options = this.options;
    const nextPhase = (lobby.phase as string) || "lobby";
    const actionKey = actionKeyForLobby(lobby);
    const isNewAction = this.renderedActionKey !== actionKey;
    const isNewPhase = Boolean(this.renderedPhase && this.renderedPhase !== nextPhase);
    const haltedByDecision = (lobby.lastDecisionTrace as Dict)?.selectedTarget === "none";
    const previousAction = this.renderedAction;
    const nextAction = (lobby.action as Dict) || null;

    if (isNewPhase) {
      options.clearStageAudioPlayers?.();
      options.clearPointPopups?.();
      options.renderVotingCards?.([]);
    }

    this.renderedPhase = nextPhase;
    if (isNewAction) options.prepareNewStageAction?.(lobby, actionKey);
    if (isNewAction && isPresentedTextAction(previousAction)) {
      const previousTarget = (previousAction!.textTarget as string) || "presentation";
      const nextTarget = (nextAction?.textTarget as string) || "presentation";
      if (!isPresentedTextAction(nextAction) || nextTarget !== previousTarget) {
        options.setStageTextObject?.(previousTarget, {
          isShown: false,
          instant: previousAction!.instant === true
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

    if ((lobby.action as Dict)?.type === "transition" && isNewAction) {
      this.renderedActionKey = actionKey;
      this.renderedAction = (lobby.action as Dict) || null;
      options.scheduleSubActions?.(lobby.action as Dict, actionKey);
      options.runStageWipe?.(() => {
        options.applyStageState?.(lobby);
        options.completeFlowAction?.("callback", (lobby.action as Dict).id);
      });
      return;
    }

    this.renderedActionKey = actionKey;
    this.renderedAction = (lobby.action as Dict) || null;
    options.applyStageState?.(lobby);
    if (isNewAction) options.runStageAction?.((lobby.action as Dict) || null, true, actionKey);
  }
}

export const PartyGameStageRenderOrchestrator = {
  actionKeyForLobby,
  createOrchestrator: (options?: OrchestratorOptions) => new StageRenderOrchestrator(options),
  StageRenderOrchestrator
};
export { StageRenderOrchestrator };

declare global {
  interface Window {
    PartyGameStageRenderOrchestrator?: typeof PartyGameStageRenderOrchestrator;
  }
}

export function installStageRenderOrchestratorGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageRenderOrchestrator = PartyGameStageRenderOrchestrator;
}

installStageRenderOrchestratorGlobals(typeof window !== "undefined" ? window : globalThis);
