// Typed port of the legacy client/controller-global-action-view.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerGlobalActionView for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;

interface GlobalActionConfig {
  id?: string;
  actionId?: string;
  buttonLabel?: string;
  enabled?: boolean;
  eventType?: string;
  layoutPhase?: string;
  message?: string;
  optionId?: string;
  pendingLabel?: string;
  run?: () => Promise<unknown> | unknown;
  showButton?: boolean;
}

export interface ControllerGlobalActionViewOptions {
  advanceStageClick: (actionId: string) => Promise<unknown> | unknown;
  applyLayoutForPhase: (phase: string) => void;
  elements: Record<string, HTMLButtonElement & HTMLElement> & Record<string, HTMLElement>;
  hideViews: () => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setShown?: (target: HTMLElement, isShown: boolean, options?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  showView: (viewId: string) => void;
}

export function createControllerGlobalActionView(options: ControllerGlobalActionViewOptions) {
  const { advanceStageClick, applyLayoutForPhase, elements, hideViews, setButtonText, setShown, setText, showView } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);

  let pendingKey = "";

  function isPresentClickAction(lobby: Dict): boolean {
    const action = lobby?.action as Dict | undefined;
    return action?.type === "present" && Boolean(action.id);
  }

  function actionKey(config: GlobalActionConfig): string {
    return `${config.id || "global"}:${config.actionId || ""}:${config.eventType || ""}`;
  }

  function syncPendingAction(config: GlobalActionConfig): void {
    const key = actionKey(config);
    if (pendingKey && pendingKey !== key) pendingKey = "";
  }

  function setButtonPending(config: GlobalActionConfig, isPending: boolean): void {
    elements.button.disabled = isPending;
    writeButtonText(elements.button, isPending ? config.pendingLabel || "Working" : config.buttonLabel || "Next", {
      width: 260,
      height: 64,
      fontSize: 24
    });
  }

  function bindButton(config: GlobalActionConfig): void {
    elements.button.onclick = async () => {
      if (pendingKey) return;
      const key = actionKey(config);
      pendingKey = key;
      setButtonPending(config, true);
      try {
        await config.run?.();
      } catch (error) {
        writeText(elements.message, (error as Error).message || "Could not advance");
      } finally {
        if (pendingKey === key) pendingKey = "";
        setButtonPending(config, false);
      }
    };
  }

  function renderConfig(config: GlobalActionConfig): boolean {
    syncPendingAction(config);
    hideViews();
    applyLayoutForPhase(config.layoutPhase || "lobby");
    showView("globalAction");
    writeText(elements.message, config.message || "Waiting for the next instruction");
    elements.button.dataset.optionId = config.optionId || "global.action";
    elements.button.dataset.actionId = config.actionId || "";
    elements.button.dataset.eventType = config.eventType || "";
    if (setShown) setShown(elements.button, config.showButton === true, { instant: true });
    else elements.button.classList.toggle("hidden", config.showButton !== true);
    elements.button.onclick = null;

    if (config.showButton === true) {
      elements.button.disabled = config.enabled !== true;
      setButtonPending(config, pendingKey === actionKey(config));
      if (config.enabled === true && typeof config.run === "function") bindButton(config);
    } else {
      elements.button.disabled = true;
      writeButtonText(elements.button, config.buttonLabel || "Next", { width: 260, height: 64, fontSize: 24 });
    }
    return true;
  }

  function presentClickConfig(lobby: Dict, me: Dict): GlobalActionConfig | null {
    if (!isPresentClickAction(lobby)) return null;
    const action = lobby.action as Dict;
    const isVip = me?.isVip === true;
    return {
      id: "presentStageClick",
      actionId: action.id as string,
      buttonLabel: "Next",
      enabled: isVip,
      eventType: "stageClick",
      layoutPhase: (lobby.phase as string) || "lobby",
      message: isVip ? "Tap Next to continue" : "Waiting for the VIP to continue",
      optionId: "global.next",
      pendingLabel: "Advancing",
      run: () => advanceStageClick(action.id as string),
      showButton: isVip
    };
  }

  function renderPresentClick(lobby: Dict, me: Dict): boolean {
    const config = presentClickConfig(lobby, me);
    return config ? renderConfig(config) : false;
  }

  function renderMessage(lobby: Dict, message: string, viewOptions: GlobalActionConfig = {}): boolean {
    return renderConfig({
      id: viewOptions.id || "message",
      actionId: viewOptions.actionId || "",
      buttonLabel: viewOptions.buttonLabel || "Next",
      enabled: viewOptions.enabled === true,
      eventType: viewOptions.eventType || "",
      layoutPhase: viewOptions.layoutPhase || (lobby?.phase as string) || "lobby",
      message,
      optionId: viewOptions.optionId || "global.message",
      pendingLabel: viewOptions.pendingLabel || "Working",
      run: viewOptions.run,
      showButton: viewOptions.showButton === true
    });
  }

  return { presentClickConfig, render: renderPresentClick, renderConfig, renderMessage };
}

declare global {
  interface Window {
    createControllerGlobalActionView?: typeof createControllerGlobalActionView;
  }
}

export function installControllerGlobalActionViewGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerGlobalActionView = createControllerGlobalActionView;
}

installControllerGlobalActionViewGlobals(typeof window !== "undefined" ? window : globalThis);
