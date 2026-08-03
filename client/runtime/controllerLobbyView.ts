// Typed port of the legacy client/controller-lobby-view.js IIFE. Imports the ported
// PartyGameControllerText directly and installs window.createControllerLobbyView for
// the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;

export interface ControllerLobbyViewOptions {
  applyLayoutForPhase: (phase: string) => void;
  disposeStartButton: () => void;
  elements: Record<string, HTMLButtonElement & HTMLElement> & Record<string, HTMLElement>;
  getStartButton: () => HTMLButtonElement;
  hideViews: () => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  showView: (viewId: string) => void;
}

export interface ControllerLobbyView {
  renderInGamePhase(me: Dict, phase: string): void;
  renderLobby(lobby: Dict, me: Dict, phase: string): number | null;
  renderMissingPlayer(): void;
}

export function createControllerLobbyView(options: ControllerLobbyViewOptions): ControllerLobbyView {
  const { applyLayoutForPhase, disposeStartButton, elements, getStartButton, hideViews, setButtonText, setText, showView } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);
  function renderMissingPlayer(): void {
    writeText(elements.meta, "Reconnecting to lobby");
    disposeStartButton();
    hideViews();
    applyLayoutForPhase("join");
    showView("join");
  }

  function renderInGamePhase(_me: Dict, phase: string): void {
    disposeStartButton();
    hideViews();
    applyLayoutForPhase(phase);
  }

  function renderLobby(lobby: Dict, me: Dict, phase: string): number | null {
    hideViews();
    applyLayoutForPhase(phase);
    showView("lobby");
    writeText(elements.playerName, me.name);
    writeText(elements.meta, me.isVip ? "VIP Player" : "Waiting for the VIP");
    if (me.isVip !== true) {
      disposeStartButton();
      return null;
    }
    const startButton = getStartButton();
    startButton.classList.toggle("danger-button", phase === "starting");
    startButton.dataset.optionId = phase === "starting" ? "lobby.cancelStart" : "lobby.startGame";
    startButton.disabled = false;
    writeButtonText(startButton, phase === "starting" ? "Cancel" : "Start Game", { width: 260, height: 64, fontSize: 24 });

    if (phase !== "starting") return null;
    const clockOffset = ((lobby.serverNow as number) || Date.now()) - Date.now();
    const updateCancelButton = () => {
      const now = Date.now() + clockOffset;
      const cancelLocked = now >= ((lobby.countdownEndsAt as number) || now);
      startButton.disabled = cancelLocked;
    };
    updateCancelButton();
    return window.setInterval(updateCancelButton, 50);
  }

  return { renderInGamePhase, renderLobby, renderMissingPlayer };
}

declare global {
  interface Window {
    createControllerLobbyView?: typeof createControllerLobbyView;
  }
}

export function installControllerLobbyViewGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerLobbyView = createControllerLobbyView;
}

installControllerLobbyViewGlobals(typeof window !== "undefined" ? window : globalThis);
