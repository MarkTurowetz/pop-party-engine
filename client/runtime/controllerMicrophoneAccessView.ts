// Typed port of the legacy client/controller-microphone-access-view.js IIFE.
// Imports the ported PartyGameControllerText directly and installs
// window.createControllerMicrophoneAccessView for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

type Dict = Record<string, unknown>;

export interface ControllerMicrophoneAccessViewOptions {
  applyLayoutForPhase: (phase: string) => void;
  elements: Record<string, HTMLButtonElement & HTMLElement> & Record<string, HTMLElement>;
  getButton: () => HTMLButtonElement;
  grantAccess: (actionId: string) => Promise<unknown> | unknown;
  hideViews: () => void;
  renderGlobalMessage: (lobby: Dict, message: string, options: { id: string }) => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  showView: (viewId: string) => void;
}

export function createControllerMicrophoneAccessView(options: ControllerMicrophoneAccessViewOptions): {
  render(lobby: Dict, me: Dict): boolean;
} {
  const { applyLayoutForPhase, elements, getButton, grantAccess, hideViews, renderGlobalMessage, setButtonText, setText, showView } =
    options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);

  const pendingAutoGrantActionIds = new Set<string>();
  const rememberedAccessKey = "partyTemplate.microphoneAccessGranted";

  function isForPlayer(input: Dict | null, me: Dict): boolean {
    if (!input) return false;
    return input.mode === "all" || me?.id === input.vipPlayerId;
  }

  function stopStream(stream: MediaStream | null | undefined): void {
    for (const track of stream?.getTracks?.() || []) {
      track.stop();
    }
  }

  async function microphonePermissionState(): Promise<string> {
    try {
      const permission = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
      return permission?.state || "";
    } catch {
      return "";
    }
  }

  function hasRememberedAccess(): boolean {
    try {
      return localStorage.getItem(rememberedAccessKey) === "true";
    } catch {
      return false;
    }
  }

  function rememberAccessGranted(): void {
    try {
      localStorage.setItem(rememberedAccessKey, "true");
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
  }

  async function browserAlreadyHasAccess(): Promise<boolean> {
    const permissionState = await microphonePermissionState();
    if (permissionState === "granted") {
      rememberAccessGranted();
      return true;
    }
    if (permissionState === "denied") return false;
    if (hasRememberedAccess()) {
      try {
        localStorage.removeItem(rememberedAccessKey);
      } catch {
        // Storage can be unavailable in private browsing modes.
      }
    }
    return false;
  }

  async function requestMicrophoneAccess(): Promise<boolean> {
    const permissionState = await microphonePermissionState();
    if (permissionState === "granted") {
      rememberAccessGranted();
      return true;
    }
    if (permissionState === "denied") {
      throw new DOMException("Microphone access was blocked", "NotAllowedError");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stopStream(stream);
    rememberAccessGranted();
    return true;
  }

  function reportGranted(input: Dict): Promise<unknown> {
    return Promise.resolve(grantAccess(input.actionId as string))
      .catch((error: Error) => {
        writeText(elements.status, error.message || "Could not confirm microphone access");
      })
      .finally(() => {
        pendingAutoGrantActionIds.delete(input.actionId as string);
      });
  }

  function autoGrantIfReady(input: Dict, alreadyGranted: boolean, button: HTMLButtonElement): void {
    const actionId = input.actionId as string;
    if (pendingAutoGrantActionIds.has(actionId)) return;
    pendingAutoGrantActionIds.add(actionId);
    Promise.resolve(alreadyGranted ? true : browserAlreadyHasAccess())
      .then((hasAccess) => {
        if (!hasAccess) {
          pendingAutoGrantActionIds.delete(actionId);
          return;
        }
        if (!button.isConnected) {
          pendingAutoGrantActionIds.delete(actionId);
          return;
        }
        rememberAccessGranted();
        button.disabled = true;
        writeText(elements.status, "Microphone ready");
        reportGranted(input);
      })
      .catch(() => {
        pendingAutoGrantActionIds.delete(actionId);
      });
  }

  function renderWaiting(lobby: Dict, message = "Waiting for the player to grant microphone access"): void {
    renderGlobalMessage(lobby, message, { id: "microphoneAccessWaiting" });
  }

  function render(lobby: Dict, me: Dict): boolean {
    const input = (lobby.microphoneAccess || null) as Dict | null;
    if (!input?.actionId) return false;
    const alreadyGranted = ((input.grantedPlayerIds as string[]) || []).includes(me.id as string);
    if (!isForPlayer(input, me)) {
      renderWaiting(lobby, "Waiting for the next instruction");
      return true;
    }

    hideViews();
    applyLayoutForPhase(controllerLayoutStateIds.microphoneAccess);
    showView("microphoneAccess");
    const button = getButton();
    writeText(elements.prompt, input.prompt || "Give microphone access to the game");
    writeButtonText(button, input.buttonLabel || "Yes", { width: 260, height: 64, fontSize: 24 });
    button.disabled = false;
    writeText(elements.status, "Chrome will ask for microphone permission");
    autoGrantIfReady(input, alreadyGranted, button);
    button.onclick = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        writeText(elements.status, "Microphone permission is not available in this browser");
        button.disabled = true;
        return;
      }
      button.disabled = true;
      writeText(elements.status, "Opening microphone permission");
      try {
        await requestMicrophoneAccess();
        writeText(elements.status, "Microphone ready");
        await grantAccess(input.actionId as string);
      } catch (error) {
        button.disabled = false;
        writeText(
          elements.status,
          (error as DOMException)?.name === "NotAllowedError" ? "Microphone access was blocked" : "Could not open the microphone"
        );
      }
    };
    return true;
  }

  return { render };
}

declare global {
  interface Window {
    createControllerMicrophoneAccessView?: typeof createControllerMicrophoneAccessView;
  }
}

export function installControllerMicrophoneAccessViewGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerMicrophoneAccessView = createControllerMicrophoneAccessView;
}

installControllerMicrophoneAccessViewGlobals(typeof window !== "undefined" ? window : globalThis);
