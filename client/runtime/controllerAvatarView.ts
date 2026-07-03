// Typed port of the legacy client/controller-avatar-view.js IIFE. Imports the
// ported PartyGameTextFit / PartyGameControllerText directly and installs
// window.createControllerAvatarView for the legacy controller runtime.

import { PartyGameTextFit } from "./textFit";
import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;
type Player = { name?: string; avatar?: { shape?: string; color?: string } };

export interface ControllerAvatarViewOptions {
  avatarClass: (shape?: string) => string;
  avatarComposites: Array<{ species: string }>;
  avatarFrameImage: () => string;
  avatarLabel: (species: string) => string;
  dinoIcon: (shape?: string) => string;
  elements: Record<string, HTMLElement>;
  getControllerState: () => { player?: Player } | null | undefined;
  playerAvatarArt?: (shape?: string) => string;
  renderState: (lobby: unknown) => void;
  setControllerPlayer: (player: Player) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  setMetaText: (message: string) => void;
  updateAvatar: (shape: string) => Promise<{ player?: Player; lobby?: unknown }>;
}

export interface ControllerAvatarView {
  close(options?: { commit?: boolean }): Promise<void>;
  isOpen(): boolean;
  open(): void;
  setAvatar(player: Player): void;
  setBanner(player: Player): void;
  syncPendingShape(player: Player | undefined): void;
}

export function createControllerAvatarView(options: ControllerAvatarViewOptions): ControllerAvatarView {
  const {
    avatarClass,
    avatarComposites,
    avatarFrameImage,
    avatarLabel,
    dinoIcon,
    elements,
    getControllerState,
    playerAvatarArt,
    renderState,
    setControllerPlayer,
    setText,
    setMetaText,
    updateAvatar
  } = options;

  const avatarArt =
    typeof playerAvatarArt === "function" ? playerAvatarArt : (shape?: string) => `${avatarFrameImage()}${dinoIcon(shape)}`;
  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };

  function writeTextBox(target: HTMLElement | null, value: unknown, spec: Dict = {}): void {
    if (!target) return;
    PartyGameTextFit.renderGameText(target, {
      text: value,
      spec: {
        width: spec.width || 90,
        height: spec.height || 18,
        fontSize: spec.fontSize || 11,
        fontColor: spec.fontColor || "#17131f",
        autoFitText: spec.autoFitText !== false,
        applySize: spec.applySize !== false
      }
    });
  }

  let pendingShape = "";
  let pickerOpen = false;

  function avatarButtonClassName(shape?: string): string {
    const preserved = Array.from(elements.avatar?.classList || []).filter(
      (className) => className.startsWith("controller-layout") || className === "controller-widget-art-host" || className === "has-controller-widget-art"
    );
    return ["controller-avatar", avatarClass(shape), ...preserved].filter(Boolean).join(" ");
  }

  function setAvatarButtonArt(html: string): void {
    const layer = elements.avatar.querySelector(":scope > .controller-widget-art-layer");
    let overlay = elements.avatar.querySelector(":scope > .controller-avatar-art-overlay") as HTMLElement | null;
    if (!overlay) {
      overlay = document.createElement("span");
      overlay.className = "controller-widget-art-overlay controller-avatar-art-overlay";
    }
    overlay.innerHTML = html;
    elements.avatar.replaceChildren(...(layer ? [layer] : []), overlay);
  }

  function setBanner(player: Player): void {
    if (!player || !elements.banner) return;
    writeText(elements.bannerName, player.name || "Player");
    elements.bannerAvatar.className = `player-avatar ${avatarClass(player.avatar?.shape)}`;
    elements.bannerAvatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
    elements.bannerAvatar.innerHTML = avatarArt(player.avatar?.shape);
  }

  function setAvatar(player: Player): void {
    elements.avatar.className = avatarButtonClassName(player.avatar?.shape);
    elements.avatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
    setAvatarButtonArt(avatarArt(player.avatar?.shape));
    setBanner(player);
  }

  function renderPicker(): void {
    const state = getControllerState();
    if (!state?.player) return;
    const currentShape = state.player.avatar?.shape || "rex";
    const currentColor = state.player.avatar?.color || "#22d3ee";
    pendingShape = pendingShape || currentShape;
    (elements.pickerGrid as HTMLElement).replaceChildren();
    for (const composite of avatarComposites) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "avatar-choice";
      button.classList.toggle("is-selected", composite.species === pendingShape);
      button.style.setProperty("--avatar-color", currentColor);
      button.innerHTML = `
          <span class="avatar-choice-icon">${avatarArt(composite.species)}</span>
          <span class="avatar-choice-label"></span>
        `;
      writeTextBox(button.querySelector(".avatar-choice-label"), avatarLabel(composite.species));
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        pendingShape = composite.species;
        renderPicker();
      });
      elements.pickerGrid.appendChild(button);
    }
  }

  function open(): void {
    const state = getControllerState();
    if (!state?.player) return;
    pendingShape = state.player.avatar?.shape || "rex";
    pickerOpen = true;
    renderPicker();
    elements.picker.classList.remove("hidden");
  }

  async function close({ commit = true }: { commit?: boolean } = {}): Promise<void> {
    const state = getControllerState();
    if (!pickerOpen) return;
    pickerOpen = false;
    elements.picker.classList.add("hidden");
    if (!commit || !state?.player) return;
    if (!pendingShape || pendingShape === state.player.avatar?.shape) return;
    try {
      const result = await updateAvatar(pendingShape);
      if (result.player) {
        setControllerPlayer(result.player);
        setAvatar(result.player);
      }
      if (result.lobby) renderState(result.lobby);
    } catch (error) {
      setMetaText((error as Error).message);
    }
  }

  function syncPendingShape(player: Player | undefined): void {
    if (!pickerOpen) pendingShape = player?.avatar?.shape || "";
  }

  return {
    close,
    isOpen: () => pickerOpen,
    open,
    setAvatar,
    setBanner,
    syncPendingShape
  };
}

declare global {
  interface Window {
    createControllerAvatarView?: typeof createControllerAvatarView;
  }
}

export function installControllerAvatarViewGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerAvatarView = createControllerAvatarView;
}

installControllerAvatarViewGlobals(typeof window !== "undefined" ? window : globalThis);
