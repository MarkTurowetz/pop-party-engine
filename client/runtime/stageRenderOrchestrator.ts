// Typed port of the legacy client/stage/render-orchestrator.js IIFE. Installs
// window.PartyGameStageRenderOrchestrator for the legacy stage runtime.

type Dict = Record<string, unknown>;

interface OrchestratorOptions {
  clearStageAudioPlayers?: () => void;
  prepareNewStageAction?: (lobby: Dict, actionKey: string) => void;
  cancelStageWipe?: () => void;
  showStageDecisionHalt?: (lobby: Dict) => void;
  applyStageState?: (lobby: Dict) => void;
  scheduleSubActions?: (action: Dict, actionKey: string) => void;
  runStageWipe?: (onCovered: () => void, complete: () => void) => void;
  completeFlowAction?: (kind: string, actionId: unknown) => void;
  runStageAction?: (action: Dict | null, immediate: boolean, actionKey: string) => void;
}

interface RenderOptions {
  force?: boolean;
}

function actionKeyForLobby(lobby: Dict = {}): string {
  const phase = (lobby.flowStateId as string) || (lobby.phase as string) || "lobby";
  const visitId = Number(lobby.momentVisitId);
  const visitKey = Number.isFinite(visitId) && visitId > 0 ? `@${visitId}` : "";
  const subroutinePath = Array.isArray(lobby.subroutinePath) ? lobby.subroutinePath.map(String).filter(Boolean).join("/") : "";
  const action = (lobby.action as Dict) || {};
  return `${phase}${visitKey}:${subroutinePath}:${action.id || action.index || ""}:${action.type || ""}`;
}

class StageRenderOrchestrator {
  options: OrchestratorOptions;
  renderedActionKey = "";
  renderedPhase = "";
  renderedAction: Dict | null = null;
  renderedRevision = -1;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;
  }

  actionKey(): string {
    return this.renderedActionKey;
  }

  phase(): string {
    return this.renderedPhase;
  }

  render(lobby: Dict = {}, renderOptions: RenderOptions = {}): void {
    const options = this.options;
    const revision = Number(lobby.revision);
    const hasRevision = Number.isFinite(revision) && revision >= 0;
    if (renderOptions.force !== true && hasRevision && revision <= this.renderedRevision) return;
    if (hasRevision) this.renderedRevision = Math.max(this.renderedRevision, revision);
    const nextPhase = (lobby.phase as string) || "lobby";
    const actionKey = actionKeyForLobby(lobby);
    const isNewAction = this.renderedActionKey !== actionKey;
    const isNewPhase = Boolean(this.renderedPhase && this.renderedPhase !== nextPhase);
    const haltedByDecision = (lobby.lastDecisionTrace as Dict)?.selectedTarget === "none";
    if (isNewPhase) {
      options.clearStageAudioPlayers?.();
    }

    this.renderedPhase = nextPhase;
    if (isNewAction) options.prepareNewStageAction?.(lobby, actionKey);
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
      options.runStageWipe?.(
        () => {
          if (this.renderedActionKey !== actionKey) return;
          options.applyStageState?.(lobby);
        },
        () => {
          if (this.renderedActionKey !== actionKey) return;
          if (((lobby.action as Dict).timing as Dict)?.mode === "S+") return;
          options.completeFlowAction?.("callback", (lobby.action as Dict).id);
        }
      );
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
