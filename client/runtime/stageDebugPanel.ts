// Typed port of the legacy client/stage/debug-panel.js IIFE. Installs
// window.PartyGameStageDebug for the legacy stage runtime.

type Dict = Record<string, unknown>;

export interface StageDebugPanelOptions {
  actionElement?: HTMLElement;
  alertElement?: HTMLElement;
}

class StageDebugPanel {
  actionElement?: HTMLElement;
  alertElement?: HTMLElement;

  constructor(options: StageDebugPanelOptions = {}) {
    this.actionElement = options.actionElement;
    this.alertElement = options.alertElement;
  }

  hideAction(): void {
    if (!this.actionElement) return;
    this.actionElement.classList.add("hidden");
    this.actionElement.textContent = "";
  }

  renderAction(lobby: Dict = {}): void {
    if (!this.actionElement) return;
    const phase = (lobby.phase as string) || "lobby";
    const debug = (lobby.debugAction as Dict) || null;
    if (phase === "lobby" || phase === "starting" || !debug) {
      this.hideAction();
      return;
    }
    const phaseName = debug.phaseName || phase;
    const actionName = debug.actionName || debug.actionId || "No Action";
    const actionType = debug.actionType ? ` / ${debug.actionType}` : "";
    const parts = [`${phaseName}: ${actionName}${actionType}`];
    const required = Number(debug.requiredInputCount || 0);
    const submitted = Number(debug.submittedInputCount || 0);
    if (required > 0 && String(debug.actionType || "").includes("Input")) {
      parts.push(`input ${submitted}/${required}`);
    }
    const records = Number(debug.playerAnswerRecordCount || 0);
    if (records > 0) parts.push(`answers ${records}`);
    const storedRounds = Number(debug.storedAnswerRoundCount || 0);
    const storedCurrent = Number(debug.storedAnswerCurrentRoundCount || 0);
    if (storedRounds > 0 || storedCurrent > 0) parts.push(`stored r${storedRounds} cur${storedCurrent}`);
    const cards = Number(debug.votingCardCount || 0);
    const visibleCards = Number(debug.visibleVotingCardCount || 0);
    const preparedCards = Number(debug.lastPreparedVotingCardCount || 0);
    if (
      cards > 0 ||
      preparedCards > 0 ||
      debug.actionType === "prepareVotingCards" ||
      debug.actionType === "setVotingCardsShown" ||
      debug.actionType === "voteOnAnswersInput"
    ) {
      parts.push(`cards ${visibleCards}/${cards} prepared ${preparedCards}`);
    }
    const skippedCards = Number(debug.lastVotingPrepareSkippedCount || 0);
    if (skippedCards > 0) parts.push(`skipped ${skippedCards}`);
    this.actionElement.textContent = parts.join(" · ");
    this.actionElement.classList.remove("hidden");
  }

  clearDecisionAlert(lobby: Dict = {}): void {
    if (!this.alertElement) return;
    if ((lobby.lastDecisionTrace as Dict)?.selectedTarget !== "none") {
      this.alertElement.classList.add("hidden");
    }
  }

  showDecisionHalt(lobby: Dict = {}): void {
    if (!this.alertElement) return;
    this.alertElement.textContent = `No Matching Branch: ${(lobby.lastDecisionTrace as Dict)?.actionId || "Unknown Action"}`;
    this.alertElement.classList.remove("hidden");
  }

  showGameObjectWarning(details: Dict = {}): void {
    if (!this.alertElement) return;
    const name = details.name || details.elementId || "Unknown Game Object";
    const scope = details.scope ? ` / ${details.scope}` : "";
    const reason = details.reason || "target unavailable";
    this.alertElement.textContent = `Game Object Warning: ${name}${scope} / ${reason}`;
    this.alertElement.classList.remove("hidden");
  }

  showArtAssetWarning(details: Dict = {}): void {
    this.showGameObjectWarning(details);
  }
}

export const PartyGameStageDebug = {
  StageDebugPanel,
  createPanel: (options?: StageDebugPanelOptions) => new StageDebugPanel(options)
};
export { StageDebugPanel };

declare global {
  interface Window {
    PartyGameStageDebug?: typeof PartyGameStageDebug;
  }
}

export function installStageDebugGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageDebug = PartyGameStageDebug;
}

installStageDebugGlobals(typeof window !== "undefined" ? window : globalThis);
