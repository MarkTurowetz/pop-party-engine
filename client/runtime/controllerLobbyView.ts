// Typed port of the legacy client/controller-lobby-view.js IIFE. Imports the ported
// PartyGameControllerText directly and installs window.createControllerLobbyView for
// the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;

export interface ControllerLobbyViewOptions {
  applyLayoutForPhase: (phase: string) => void;
  elements: Record<string, HTMLButtonElement & HTMLElement> & Record<string, HTMLElement>;
  hideViews: () => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  setAvatar: (me: Dict) => void;
  showView: (viewId: string) => void;
}

export interface ControllerLobbyView {
  renderInGamePhase(me: Dict, phase: string): void;
  renderLobby(lobby: Dict, me: Dict, phase: string): number | null;
  renderMissingPlayer(): void;
}

export function createControllerLobbyView(options: ControllerLobbyViewOptions): ControllerLobbyView {
  const { applyLayoutForPhase, elements, hideViews, setButtonText, setText, setAvatar, showView } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);

  function renderMissingPlayer(): void {
    writeText(elements.meta, "Reconnecting to lobby");
    hideViews();
    elements.introPresentButton.classList.add("hidden");
    applyLayoutForPhase("lobby");
    showView("lobby");
    elements.startButton.classList.add("hidden");
  }

  function renderInGamePhase(me: Dict, phase: string): void {
    hideViews();
    applyLayoutForPhase(phase);
    if (phase === "intro") showView("intro");
    elements.introPresentButton.classList.toggle("hidden", !(me.isVip && phase === "intro"));
    elements.introPresentButton.disabled = !(me.isVip && phase === "intro");
  }

  function renderLobby(lobby: Dict, me: Dict, phase: string): number | null {
    hideViews();
    elements.introPresentButton.classList.add("hidden");
    applyLayoutForPhase(phase);
    showView("lobby");
    writeText(elements.playerName, me.name);
    setAvatar(me);
    writeText(elements.meta, me.isVip ? "VIP Player" : "Waiting for the VIP");
    elements.startButton.classList.toggle("hidden", !me.isVip);
    elements.startButton.classList.toggle("danger-button", phase === "starting");
    writeButtonText(elements.startButton, phase === "starting" ? "Cancel" : "Start Game", { width: 260, height: 64, fontSize: 24 });
    elements.startButton.dataset.optionId = phase === "starting" ? "lobby.cancelStart" : "lobby.startGame";
    elements.startButton.disabled = !me.isVip;

    if (!me.isVip || phase !== "starting") return null;
    const clockOffset = ((lobby.serverNow as number) || Date.now()) - Date.now();
    const updateCancelButton = () => {
      const now = Date.now() + clockOffset;
      const cancelLocked = now >= ((lobby.countdownEndsAt as number) || now);
      elements.startButton.disabled = cancelLocked;
      if (cancelLocked) {
        elements.startButton.classList.remove("is-pressed", "is-releasing");
      }
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
