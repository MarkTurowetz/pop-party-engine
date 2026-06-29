// Typed port of the legacy client/utils.js. Behaviour preserved 1:1. The shared
// app-shell state (artAssets, artCompositions, params, …) lives on window via the
// app-shell exposure block, so this module reads/writes it through window/globalThis.
// All public helpers are installed on window so the still-legacy runtime scripts
// (controller.js, stage-runtime.js, layout-runtime.js, app-shell.js) keep resolving
// them as bare identifiers.

type Dict = Record<string, unknown>;
type ArtComposition = { id?: string; canvas?: { width?: number; height?: number }; components?: Dict[] };

interface ArtSchemaApi {
  normalizeComponentKind?: (kind?: string) => string;
  normalizeShapeStyle?: (style?: string, kind?: string) => string;
}
interface ToolContextApi {
  api?: { art?: { loadArtAssets?: () => Promise<Dict> } };
}

declare global {
  interface Window {
    params: URLSearchParams;
    canUseServer: boolean;
    artAssets: Dict[];
    artGroups: Dict[];
    artCompositions: ArtComposition[];
    artOrganization: Dict;
    artOrganizationSavedSnapshot: string;
    artAssetUrls: Map<string, string>;
    avatarAssetIds: Record<string, string>;
    avatarComposites: Array<{ species: string; name: string }>;
    controllerScreen: HTMLElement;
    PartyGameArtComponentSchema?: ArtSchemaApi;
    publishRuntimeLocalChanges?: () => void;
    // Utils helpers installed on window for legacy + TS consumers.
    normalizeStageCode?: (value: unknown) => string;
    getStageCodeFromUrl?: () => string;
    getPlayerNameFromUrl?: () => string;
    shouldAutoJoin?: () => boolean;
    lockControllerViewport?: () => void;
    bindButtonPress?: (button: HTMLElement) => void;
    bindControllerButtonPressStates?: () => void;
    getSessionValue?: (key: string) => string;
    getLocalValue?: (key: string) => string;
    setSessionValue?: (key: string, value: string) => void;
    setLocalValue?: (key: string, value: string) => void;
    removeSessionValue?: (key: string) => void;
    getControllerPlayerId?: () => string;
    avatarClass?: (shape?: string) => string;
    avatarFrameImage?: () => string;
    avatarLabel?: (shape?: string) => string;
    dinoIcon?: (shape?: string) => string;
    playerAvatarArt?: (shape?: string) => string;
    listenForArtAssetsChanged?: (callback: () => void) => void;
    loadArtAssets?: () => Promise<Dict[]>;
    postJson?: (path: string, payload: unknown) => Promise<Dict>;
    getJson?: (path: string) => Promise<Dict>;
  }
}

const w = window;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeStageCode(value: unknown): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function generateStageCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[randomBetween(0, alphabet.length - 1)];
  }
  return code;
}

function getStageCodeFromUrl(): string {
  return normalizeStageCode(w.params.get("stage") || w.params.get("code"));
}

function getPlayerNameFromUrl(): string {
  return String(w.params.get("name") || w.params.get("playerName") || "").trim().slice(0, 24);
}

function shouldAutoJoin(): boolean {
  return w.params.get("autojoin") === "1" || w.params.get("join") === "1";
}

function syncAppHeight(): void {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

function shouldAllowControllerTouch(target: EventTarget | null): boolean {
  return Boolean((target as Element)?.closest?.("input, textarea, select, .avatar-picker-grid"));
}

function lockControllerViewport(): void {
  syncAppHeight();
  document.documentElement.classList.add("controller-locked");
  document.body.classList.add("controller-locked");
  window.scrollTo(0, 0);
  window.addEventListener("resize", syncAppHeight);
  window.addEventListener("orientationchange", syncAppHeight);
  window.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
  window.addEventListener(
    "touchmove",
    (event) => {
      if (!shouldAllowControllerTouch(event.target)) event.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener("contextmenu", (event) => {
    if (!shouldAllowControllerTouch(event.target)) event.preventDefault();
  });
  window.addEventListener("selectstart", (event) => {
    if (!shouldAllowControllerTouch(event.target)) event.preventDefault();
  });
  window.addEventListener("dragstart", (event) => event.preventDefault());
  window.addEventListener("gesturestart", (event) => (event as Event).preventDefault());
  document.addEventListener("selectionchange", () => {
    if ((document.activeElement as Element)?.matches?.("input, textarea")) return;
    window.getSelection()?.removeAllRanges();
  });
}

type PressButton = HTMLButtonElement & { releaseTimerId?: number };

function bindButtonPress(button: PressButton): void {
  const pressButton = () => {
    if (button.disabled) return;
    window.clearTimeout(button.releaseTimerId);
    button.classList.remove("is-releasing");
    button.classList.add("is-pressed");
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch {
      /* optional */
    }
  };
  const releaseButton = () => {
    if (!button.classList.contains("is-pressed")) return;
    button.classList.add("is-releasing");
    button.classList.remove("is-pressed");
    window.clearTimeout(button.releaseTimerId);
    button.releaseTimerId = window.setTimeout(() => button.classList.remove("is-releasing"), 140);
  };
  button.addEventListener("pointerdown", pressButton);
  button.addEventListener("pointerup", releaseButton);
  button.addEventListener("pointercancel", releaseButton);
  button.addEventListener("pointerleave", releaseButton);
  button.addEventListener("blur", releaseButton);
  let touchStarted = false;
  button.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      touchStarted = true;
      pressButton();
    },
    { passive: false }
  );
  button.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const endedOn = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null;
      releaseButton();
      if (touchStarted && (endedOn === button || button.contains(endedOn)) && !button.disabled) button.click();
      touchStarted = false;
    },
    { passive: false }
  );
  button.addEventListener(
    "touchcancel",
    (e) => {
      e.preventDefault();
      touchStarted = false;
      releaseButton();
    },
    { passive: false }
  );
  button.addEventListener("dblclick", (e) => e.preventDefault());
}

function bindControllerButtonPressStates(): void {
  const pressableButtons = w.controllerScreen.querySelectorAll("button");
  let lastHapticAt = 0;
  const pulseHaptic = () => {
    if (!navigator.vibrate) return;
    const now = Date.now();
    if (now - lastHapticAt < 80) return;
    lastHapticAt = now;
    try {
      navigator.vibrate(8);
    } catch {
      // Haptics are optional and browser/device dependent.
    }
  };
  const pressButton = (button: PressButton) => {
    if (button.disabled) return;
    window.clearTimeout(button.releaseTimerId);
    button.classList.remove("is-releasing");
    button.classList.add("is-pressed");
    pulseHaptic();
  };
  const releaseButton = (button: PressButton) => {
    if (!button.classList.contains("is-pressed")) return;
    button.classList.add("is-releasing");
    button.classList.remove("is-pressed");
    window.clearTimeout(button.releaseTimerId);
    button.releaseTimerId = window.setTimeout(() => {
      button.classList.remove("is-releasing");
    }, 140);
  };
  const releaseButtons = () => {
    for (const button of pressableButtons) releaseButton(button as PressButton);
  };
  for (const node of pressableButtons) {
    const button = node as PressButton;
    let touchStartedOnButton = false;
    button.addEventListener("pointerdown", () => {
      window.getSelection()?.removeAllRanges();
      pressButton(button);
    });
    button.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        touchStartedOnButton = true;
        window.getSelection()?.removeAllRanges();
        pressButton(button);
      },
      { passive: false }
    );
    button.addEventListener(
      "touchend",
      (event) => {
        event.preventDefault();
        const touch = event.changedTouches[0];
        const endTarget = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null;
        const endedOnButton = endTarget === button || button.contains(endTarget);
        releaseButton(button);
        if (touchStartedOnButton && endedOnButton && !button.disabled) button.click();
        touchStartedOnButton = false;
      },
      { passive: false }
    );
    button.addEventListener(
      "touchcancel",
      (event) => {
        event.preventDefault();
        touchStartedOnButton = false;
        releaseButton(button);
      },
      { passive: false }
    );
    button.addEventListener("dblclick", (event) => event.preventDefault());
    button.addEventListener("pointerup", () => releaseButton(button));
    button.addEventListener("pointercancel", () => releaseButton(button));
    button.addEventListener("pointerleave", () => releaseButton(button));
    button.addEventListener("blur", () => releaseButton(button));
  }
  window.addEventListener("pointerup", releaseButtons);
  window.addEventListener("pointercancel", releaseButtons);
}

function getOrCreateStageCode(): string {
  const existing = getStageCodeFromUrl();
  if (existing) return existing;
  const next = generateStageCode();
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("stage", next);
  window.history.replaceState({}, "", `${window.location.pathname}?${nextParams.toString()}`);
  return next;
}

function getSessionValue(key: string): string {
  return sessionStorage.getItem(key) || "";
}

function getLocalValue(key: string): string {
  return localStorage.getItem(key) || "";
}

function setSessionValue(key: string, value: string): void {
  sessionStorage.setItem(key, value);
}

function setLocalValue(key: string, value: string): void {
  localStorage.setItem(key, value);
}

const artAssetsChangedStorageKey = "partyTemplate.artAssetsChangedAt";
const artAssetsChangedChannelName = "partyTemplate.artAssetsChanged";
const artAssetsChangedChannels: BroadcastChannel[] = [];
const artCompositionDrafts = new Map<string, ArtComposition>();
const changedArtCompositionIds = new Set<string>();
const pendingDeletedArtCompositionIds = new Set<string>();

function cloneArtCompositionDraft(composition: ArtComposition): ArtComposition {
  try {
    return JSON.parse(JSON.stringify(composition));
  } catch {
    return composition;
  }
}

function rememberArtCompositionDrafts(compositions: ArtComposition[] = w.artCompositions): void {
  for (const composition of compositions || []) {
    if (!composition?.id) continue;
    if (pendingDeletedArtCompositionIds.has(composition.id)) continue;
    artCompositionDrafts.set(composition.id, cloneArtCompositionDraft(composition));
    changedArtCompositionIds.add(composition.id);
  }
}

function forgetArtCompositionDraft(compositionId: string): void {
  artCompositionDrafts.delete(compositionId);
  changedArtCompositionIds.delete(compositionId);
}

function clearArtCompositionDrafts(): void {
  artCompositionDrafts.clear();
  changedArtCompositionIds.clear();
}

function changedArtCompositionIdList(): string[] {
  return [...changedArtCompositionIds].filter((compositionId) => !pendingDeletedArtCompositionIds.has(compositionId));
}

function markArtCompositionPendingDelete(compositionId: string): void {
  if (!compositionId) return;
  pendingDeletedArtCompositionIds.add(compositionId);
  forgetArtCompositionDraft(compositionId);
}

function clearArtCompositionPendingDelete(compositionId: string): void {
  if (!compositionId) return;
  pendingDeletedArtCompositionIds.delete(compositionId);
}

function clearAllArtCompositionPendingDeletes(): void {
  pendingDeletedArtCompositionIds.clear();
}

function isArtCompositionPendingDelete(compositionId: string): boolean {
  return pendingDeletedArtCompositionIds.has(compositionId);
}

function artCompositionsPendingDeleteCount(): number {
  return pendingDeletedArtCompositionIds.size;
}

function pendingArtCompositionDeleteIds(): string[] {
  return [...pendingDeletedArtCompositionIds];
}

function mergeArtCompositionDrafts(compositions: ArtComposition[] = []): ArtComposition[] {
  const byId = new Map<string, ArtComposition>(
    (compositions || [])
      .filter((composition) => composition?.id && !pendingDeletedArtCompositionIds.has(composition.id))
      .map((composition) => [composition.id as string, composition])
  );
  for (const [id, composition] of artCompositionDrafts.entries()) {
    if (pendingDeletedArtCompositionIds.has(id)) continue;
    byId.set(id, cloneArtCompositionDraft(composition));
  }
  return [...byId.values()];
}

function notifyArtAssetsChanged(): void {
  const updatedAt = String(Date.now());
  if (typeof w.publishRuntimeLocalChanges === "function") w.publishRuntimeLocalChanges();
  try {
    setLocalValue(artAssetsChangedStorageKey, updatedAt);
  } catch {
    // Local storage can be unavailable in privacy modes; BroadcastChannel may still work.
  }
  window.dispatchEvent(new CustomEvent("partyTemplate:artAssetsChanged", { detail: { updatedAt } }));
  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(artAssetsChangedChannelName);
      channel.postMessage({ updatedAt });
      channel.close();
    } catch {
      // Art changes are still saved server-side even if cross-window notification fails.
    }
  }
}

function listenForArtAssetsChanged(callback: () => void): void {
  if (typeof callback !== "function") return;
  window.addEventListener("partyTemplate:artAssetsChanged", callback);
  window.addEventListener("storage", (event) => {
    if (event.key === artAssetsChangedStorageKey) callback();
  });
  if (!("BroadcastChannel" in window)) return;
  try {
    const channel = new BroadcastChannel(artAssetsChangedChannelName);
    channel.addEventListener("message", callback);
    artAssetsChangedChannels.push(channel);
  } catch {
    // Storage events remain as a fallback.
  }
}

function getLocalJsonArray(key: string): unknown[] {
  try {
    const value = JSON.parse(getLocalValue(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function removeSessionValue(key: string): void {
  sessionStorage.removeItem(key);
}

function getControllerPlayerId(): string {
  const explicit = w.params.get("player");
  if (explicit) return explicit;
  const existing = getSessionValue("partyTemplatePlayerId");
  if (existing) return existing;
  const next = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setSessionValue("partyTemplatePlayerId", next);
  return next;
}

function avatarClass(shape?: string): string {
  return `shape-${shape || "rex"}`;
}

function cssUrl(url?: string): string {
  return `url('${String(url || "").replaceAll("'", "%27")}')`;
}

function artAssetUrl(assetId?: string): string {
  return w.artAssetUrls.get(assetId || "") || "";
}

function avatarCompositionId(shape?: string): string {
  const species = shape && w.avatarAssetIds[shape] ? shape : "rex";
  return `player-avatar-${species}`;
}

function avatarComponentStyle(component: Dict, canvas: Dict | undefined, layerIndex = 0, siblingCount = 1): string {
  const canvasWidth = Math.max(1, Number(canvas?.width || 1));
  const canvasHeight = Math.max(1, Number(canvas?.height || 1));
  return [
    `z-index:${Math.max(1, Number(siblingCount || 1) - Number(layerIndex || 0))}`,
    `left:${(Number(component.x || 0) / canvasWidth) * 100}%`,
    `top:${(Number(component.y || 0) / canvasHeight) * 100}%`,
    `width:${(Number(component.width || 1) / canvasWidth) * 100}%`,
    `height:${(Number(component.height || 1) / canvasHeight) * 100}%`,
    `transform:translate(-50%, -50%) rotate(${Number(component.rotation || 0)}deg) scale(${Number(component.scale || 1)})`,
    `--avatar-component-fit:${component.imageObjectFit || "cover"}`,
    `--avatar-component-fill:${component.fillColor || "transparent"}`
  ].join(";");
}

function avatarComponentImageSource(component?: Dict): string {
  return (component?.imageDataUrl as string) || artAssetUrl(component?.imageAssetId as string) || "";
}

function avatarCompositionComponentMarkup(component: Dict, canvas: Dict | undefined, layerIndex = 0, siblingCount = 1): string {
  const imageSource = avatarComponentImageSource(component);
  const style = avatarComponentStyle(component, canvas, layerIndex, siblingCount);
  const kind = w.PartyGameArtComponentSchema?.normalizeComponentKind?.(component?.kind as string) || component?.kind || "shape";
  const shapeStyle =
    w.PartyGameArtComponentSchema?.normalizeShapeStyle?.(component?.shapeStyle as string, kind as string) ||
    component?.shapeStyle ||
    "rounded";
  const classes = `avatar-art-component is-${kind} is-style-${shapeStyle}${imageSource ? " has-image-mask" : ""}${component.imageTint === "currentColor" && imageSource ? " has-tinted-image-mask" : ""}`;
  if (component.imageTint === "currentColor" && imageSource) {
    return `<span class="${classes}" style="${style};--avatar-mask-url:${cssUrl(imageSource)}"><span class="avatar-art-mask-image"></span></span>`;
  }
  if (imageSource) {
    return `<span class="${classes}" style="${style}"><img class="avatar-art-image" alt="" draggable="false" src="${imageSource}"></span>`;
  }
  return `<span class="${classes}" style="${style}"></span>`;
}

function playerAvatarArt(shape?: string): string {
  const composition = artComposition(avatarCompositionId(shape));
  if (!composition) return `${avatarFrameImage()}${dinoIcon(shape)}`;
  const canvas = composition.canvas || { width: 100, height: 100 };
  const componentList = composition.components || [];
  const components = componentList
    .map((component, index) => avatarCompositionComponentMarkup(component, canvas, index, componentList.length))
    .join("");
  return `<span class="player-avatar-art-composition">${components}</span>`;
}

function dinoIcon(shape?: string): string {
  const species = shape && w.avatarAssetIds[shape] ? shape : "rex";
  const url = artAssetUrl(w.avatarAssetIds[species]);
  return `<span class="avatar-dino-mask dino-icon dino-${species}" style="--dino-url:${cssUrl(url)}"><span class="avatar-dino-mask-image"></span></span>`;
}

function avatarFrameImage(): string {
  return `<img class="avatar-frame-art" alt="" src="${artAssetUrl("avatar-frame")}">`;
}

function avatarLabel(shape?: string): string {
  return w.avatarComposites.find((composite) => composite.species === shape)?.name.replace("Player Avatar ", "") || shape || "";
}

function artComposition(compositionId: string): ArtComposition | null {
  return (w.artCompositions || []).find((composition) => composition.id === compositionId) || null;
}

function normalizeLoadedArtOrganization(organization: Dict = w.artOrganization): Dict {
  const blankSurface = () => ({ folders: [], order: [], folderItems: {} });
  const normalized: Dict = { stage: blankSurface(), controller: blankSurface() };
  for (const surface of ["stage", "controller"]) {
    const incoming = (organization?.[surface] || {}) as Dict;
    normalized[surface] = {
      folders: Array.isArray(incoming.folders)
        ? incoming.folders
            .map((folder: Dict) => ({ id: String(folder.id || ""), name: String(folder.name || "Folder") }))
            .filter((folder: { id: string }) => folder.id)
        : [],
      order: Array.isArray(incoming.order) ? incoming.order.map(String).filter(Boolean) : [],
      folderItems: incoming.folderItems && typeof incoming.folderItems === "object" ? { ...incoming.folderItems } : {}
    };
  }
  return normalized;
}

function applyArtAssets(
  assets: Dict[],
  groups: Dict[] = w.artGroups,
  compositions: ArtComposition[] = w.artCompositions,
  organization: Dict = w.artOrganization
): void {
  w.artAssets = assets || [];
  w.artGroups = groups || [];
  w.artCompositions = mergeArtCompositionDrafts(compositions || []);
  w.artOrganization = normalizeLoadedArtOrganization(organization);
  w.artOrganizationSavedSnapshot = JSON.stringify(w.artOrganization);
  for (const asset of w.artAssets) {
    w.artAssetUrls.set(asset.id as string, asset.currentUrl as string);
  }
  document.documentElement.style.setProperty("--click-cursor-url", cssUrl(artAssetUrl("presentation-click-cursor")));
}

async function loadArtAssets(): Promise<Dict[]> {
  if (!w.canUseServer) {
    applyArtAssets([]);
    return [];
  }
  const toolContext = w.PartyGameToolContext as ToolContextApi | undefined;
  const result = (await (toolContext?.api?.art?.loadArtAssets?.() || getJson("/api/art-assets"))) as Dict;
  applyArtAssets(
    (result.assets as Dict[]) || [],
    (result.groups as Dict[]) || [],
    (result.compositions as ArtComposition[]) || [],
    result.organization as Dict
  );
  return w.artAssets;
}

interface ApiError extends Error {
  code?: string;
  status?: number;
}

async function postJson(path: string, payload: unknown): Promise<Dict> {
  if (!w.canUseServer) throw new Error("Open this app through the server first.");
  const response = await fetch(`${location.origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = (await response.json().catch(() => ({}))) as Dict;
  if (!response.ok || result.ok === false) {
    const error = new Error((result.error as string) || "Something went wrong.") as ApiError;
    error.code = (result.errorCode as string) || "";
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getJson(path: string): Promise<Dict> {
  const response = await fetch(`${location.origin}${path}`, { cache: "no-store" });
  const result = (await response.json().catch(() => ({}))) as Dict;
  if (!response.ok || result.ok === false) {
    throw new Error((result.error as string) || "Something went wrong.");
  }
  return result;
}

const utilsApi = {
  randomBetween,
  normalizeStageCode,
  generateStageCode,
  getStageCodeFromUrl,
  getPlayerNameFromUrl,
  shouldAutoJoin,
  syncAppHeight,
  shouldAllowControllerTouch,
  lockControllerViewport,
  bindButtonPress,
  bindControllerButtonPressStates,
  getOrCreateStageCode,
  getSessionValue,
  getLocalValue,
  setSessionValue,
  setLocalValue,
  cloneArtCompositionDraft,
  rememberArtCompositionDrafts,
  forgetArtCompositionDraft,
  clearArtCompositionDrafts,
  changedArtCompositionIdList,
  markArtCompositionPendingDelete,
  clearArtCompositionPendingDelete,
  clearAllArtCompositionPendingDeletes,
  isArtCompositionPendingDelete,
  artCompositionsPendingDeleteCount,
  pendingArtCompositionDeleteIds,
  mergeArtCompositionDrafts,
  notifyArtAssetsChanged,
  listenForArtAssetsChanged,
  getLocalJsonArray,
  removeSessionValue,
  getControllerPlayerId,
  avatarClass,
  cssUrl,
  artAssetUrl,
  avatarCompositionId,
  avatarComponentStyle,
  avatarComponentImageSource,
  avatarCompositionComponentMarkup,
  playerAvatarArt,
  dinoIcon,
  avatarFrameImage,
  avatarLabel,
  artComposition,
  normalizeLoadedArtOrganization,
  applyArtAssets,
  loadArtAssets,
  postJson,
  getJson
};

export type PartyGameUtilsApi = typeof utilsApi;

/** Install every util on window so the still-legacy runtime resolves bare identifiers. */
export function installUtilsGlobals(target: Window | typeof globalThis = globalThis): void {
  Object.assign(target, utilsApi);
}

installUtilsGlobals(typeof window !== "undefined" ? window : globalThis);

export { utilsApi };
export {
  normalizeStageCode,
  getStageCodeFromUrl,
  getSessionValue,
  getLocalValue,
  setSessionValue,
  setLocalValue,
  getControllerPlayerId,
  postJson,
  getJson,
  loadArtAssets,
  playerAvatarArt
};
