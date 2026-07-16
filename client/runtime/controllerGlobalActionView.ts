// Typed port of the legacy client/controller-global-action-view.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerGlobalActionView for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

type Dict = Record<string, unknown>;
type TextTarget = HTMLElement | string;

interface ControllerActionSlot {
  buttonContainer: HTMLElement;
  buttonId: string;
  message: TextTarget;
}

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
  bindPress?: (button: HTMLButtonElement) => void;
  createButton?: (slot: ControllerActionSlot) => HTMLButtonElement;
  disposeButtonArt?: (button: HTMLButtonElement) => void;
  elements: {
    presentation: ControllerActionSlot;
    paused: ControllerActionSlot;
    state: HTMLElement;
  };
  hideViews: () => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setButtonLifecycleState?: (target: HTMLButtonElement, state: "Off" | "On") => void;
  setText?: (target: TextTarget, value: unknown) => void;
  showView: (viewId: string) => void;
}

export function createControllerGlobalActionView(options: ControllerGlobalActionViewOptions) {
  const {
    advanceStageClick,
    applyLayoutForPhase,
    bindPress,
    createButton,
    disposeButtonArt,
    elements,
    hideViews,
    setButtonLifecycleState,
    setButtonText,
    setText,
    showView
  } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: TextTarget, value: unknown) => {
          if (typeof target !== "string") PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);

  let pendingKey = "";
  let activeButton: HTMLButtonElement | null = null;
  let activeSlot: ControllerActionSlot | null = null;

  function slotForLayout(layoutPhase: string): ControllerActionSlot {
    return layoutPhase === controllerLayoutStateIds.paused ? elements.paused : elements.presentation;
  }

  function defaultCreateButton(slot: ControllerActionSlot): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.id = slot.buttonId;
    button.className = "primary-button controller-local-action-button";
    button.dataset.controllerOption = "";
    slot.buttonContainer.replaceChildren(button);
    return button;
  }

  function disposeActiveButton(): void {
    if (!activeButton) return;
    setButtonLifecycleState?.(activeButton, "Off");
    disposeButtonArt?.(activeButton);
    activeButton.remove();
    activeButton = null;
    activeSlot = null;
    pendingKey = "";
  }

  function ensureButton(slot: ControllerActionSlot): { button: HTMLButtonElement; isNew: boolean } {
    if (activeButton && activeSlot === slot && activeButton.isConnected) return { button: activeButton, isNew: false };
    disposeActiveButton();
    const button = (createButton || defaultCreateButton)(slot);
    if (!button.parentElement) slot.buttonContainer.replaceChildren(button);
    bindPress?.(button);
    activeButton = button;
    activeSlot = slot;
    return { button, isNew: true };
  }

  function prepareForLayout(layoutPhase: string): void {
    const isActionLayout = layoutPhase === controllerLayoutStateIds.presentation || layoutPhase === controllerLayoutStateIds.paused;
    const slot = isActionLayout ? slotForLayout(layoutPhase) : null;
    if (!slot || (activeSlot && activeSlot !== slot)) disposeActiveButton();
  }

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

  function setButtonPending(button: HTMLButtonElement, config: GlobalActionConfig, isPending: boolean): void {
    button.disabled = isPending || config.enabled !== true;
    writeButtonText(button, isPending ? config.pendingLabel || "Working" : config.buttonLabel || "Next", {
      width: 260,
      height: 64,
      fontSize: 24
    });
  }

  function bindButton(button: HTMLButtonElement, message: TextTarget, config: GlobalActionConfig): void {
    button.onclick = async () => {
      if (pendingKey) return;
      const key = actionKey(config);
      pendingKey = key;
      setButtonPending(button, config, true);
      try {
        await config.run?.();
      } catch (error) {
        writeText(message, (error as Error).message || "Could not advance");
      } finally {
        if (pendingKey === key) pendingKey = "";
        if (button.isConnected) setButtonPending(button, config, false);
      }
    };
  }

  function renderConfig(config: GlobalActionConfig): boolean {
    syncPendingAction(config);
    const layoutPhase = config.layoutPhase || controllerLayoutStateIds.presentation;
    const slot = slotForLayout(layoutPhase);
    prepareForLayout(layoutPhase);
    hideViews();
    applyLayoutForPhase(layoutPhase);
    showView("globalAction");
    writeText(slot.message, config.message || "Waiting for the next instruction");

    if (config.showButton === true) {
      const { button, isNew } = ensureButton(slot);
      button.dataset.optionId = config.optionId || "global.action";
      button.dataset.actionId = config.actionId || "";
      button.dataset.eventType = config.eventType || "";
      button.onclick = null;
      button.disabled = config.enabled !== true;
      setButtonPending(button, config, pendingKey === actionKey(config));
      if (isNew) setButtonLifecycleState?.(button, "On");
      if (config.enabled === true && typeof config.run === "function") bindButton(button, slot.message, config);
    } else if (activeSlot === slot) {
      disposeActiveButton();
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
      layoutPhase: controllerLayoutStateIds.presentation,
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
      layoutPhase: viewOptions.layoutPhase || controllerLayoutStateIds.presentation,
      message,
      optionId: viewOptions.optionId || "global.message",
      pendingLabel: viewOptions.pendingLabel || "Working",
      run: viewOptions.run,
      showButton: viewOptions.showButton === true
    });
  }

  return { dispose: disposeActiveButton, prepareForLayout, presentClickConfig, render: renderPresentClick, renderConfig, renderMessage };
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
