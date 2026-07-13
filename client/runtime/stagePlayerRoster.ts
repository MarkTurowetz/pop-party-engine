// Typed port of the legacy client/stage/player-roster-renderer.js IIFE — the stage
// player tile roster + point popups. Installs window.PartyGamePlayerRoster for the
// legacy stage runtime. PartyGame* + artComposition deps are read lazily via
// globalThis at call time.

import { distributedContainerItemPositions, type DistributedItemSize } from "./distributedContainerLayout";
import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import { defaultPlayerPointPopupTimeline } from "../../shared/player-point-popup-timeline";
import type { TimelineDocument } from "../../shared/timeline-model";

type Dict = Record<string, unknown>;
type El = HTMLElement;
interface GameObjectLike {
  target?: unknown;
  update: (options: Dict) => GameObjectLike;
  playVisibility: (isShown: boolean, options?: Dict) => number;
}
interface GameObjectApi {
  create?: (options: Dict) => GameObjectLike;
}
interface TreeRenderer {
  render: (components: Dict[], canvas: Dict, options: Dict) => void;
  isComponentVisible?: (componentId: string) => boolean;
  playAll?: (animation: string, options?: Dict) => number;
  playComponent?: (componentId: string, animation: string, options?: Dict) => number;
  playComponentTree?: (componentId: string, animation: string, options?: Dict) => number;
  stopAtComponent?: (componentId: string, animation: string, options?: Dict) => number;
}

declare global {
  interface Window {
    PartyGamePlayerRoster?: typeof PartyGamePlayerRoster;
  }
}

const w = () => globalThis as typeof globalThis & Window;

export const PLAYER_WIDGET_COMPOSITION_ID = "prefab-player-widget-mc";
const PLAYER_ANSWER_BUBBLE_MC_ID = "player-answer-bubble-mc";
const PLAYER_AVATAR_MC_ID = "player-avatar-mc";
const PLAYER_NAME_MC_ID = "player-name-mc";
const PLAYER_VIP_MC_ID = "vip-mc";
const AVATAR_FRAME_ID = "avatar";

const avatarTimelineLabels: Record<string, string> = {
  rex: "Rex",
  stego: "Stego",
  trike: "Trike",
  raptor: "Raptor",
  bronto: "Bronto",
  ankylo: "Cleo",
  cleo: "Cleo"
};

function createGameObject(gameObjectApi: GameObjectApi | undefined, options: Dict = {}): GameObjectLike | null {
  return typeof gameObjectApi?.create === "function" ? gameObjectApi.create(options) : null;
}

function renderStageTextBox(target: El | null, text: unknown, spec: Dict = {}): Dict | null {
  return (w().PartyGameStageTextRenderer?.renderStageTextBox?.(target, text, spec, (spec.options as Dict) || {}) as Dict) || null;
}

function fn(value: unknown): boolean {
  return typeof value === "function";
}

function cloneArtComponent(component: Dict, apply?: (component: Dict) => void): Dict {
  const clone: Dict = {
    ...component,
    children: ((component.children as Dict[]) || []).map((child) => cloneArtComponent(child, apply))
  };
  apply?.(clone);
  return clone;
}

function cloneArtComposition(composition: Dict, apply?: (component: Dict) => void): Dict {
  return {
    ...composition,
    canvas: { ...((composition.canvas as Dict) || {}) },
    components: ((composition.components as Dict[]) || []).map((component) => cloneArtComponent(component, apply))
  };
}

function pointPopupTimeline(composition: Dict): TimelineDocument {
  const authored = composition.timeline as TimelineDocument | null | undefined;
  return authored && ((authored.labels || []).length > 0 || (authored.commands || []).length > 0 || (authored.tracks || []).length > 0)
    ? effectiveVisibilityTimeline(authored)
    : defaultPlayerPointPopupTimeline();
}

function usesCurrentColor(component: Dict): boolean {
  return [component.fillColor, component.fillCss, component.borderColor, component.imageTint, component.fontColor]
    .map((value) => String(value || "").trim().toLowerCase())
    .includes("currentcolor");
}

function applyRuntimePlayerColor(component: Dict, color: string): void {
  if (!color || !usesCurrentColor(component)) return;
  component.fontColor = color;
}

function elementDimension(element: El | undefined, dimension: "width" | "height", fallback = 1): number {
  if (!element) return fallback;
  const clientValue = dimension === "width" ? element.clientWidth : element.clientHeight;
  if (clientValue > 0) return clientValue;
  const rect = element.getBoundingClientRect?.();
  const rectValue = rect ? Number(rect[dimension]) : 0;
  if (rectValue > 0) return rectValue;
  const styleValue = Number.parseFloat(element.style.getPropertyValue(dimension));
  return Number.isFinite(styleValue) && styleValue > 0 ? styleValue : fallback;
}

function tileDistributionSize(tile: El): DistributedItemSize {
  const width = Number(tile.dataset.playerObjectWidth || 0) || Number.parseFloat(tile.style.getPropertyValue("--player-object-width")) || 300;
  const height = Number(tile.dataset.playerObjectHeight || 0) || Number.parseFloat(tile.style.getPropertyValue("--player-object-height")) || 300;
  const scale = Number(tile.dataset.playerObjectScale || 1) || 1;
  return { width, height, scale };
}

export interface PlayerAnswerBubbleRuntimeState {
  hasAnswer: boolean;
  visible: boolean;
  text: string;
  nonce: string;
  correctness: string;
}

export interface PlayerVipRuntimeState {
  visible: boolean;
}

export function legacyPlayerObjectCompositionIdForShape(shape?: unknown): string {
  const species = String(shape || "rex").trim().toLowerCase() || "rex";
  return `player-object-${species}`;
}

export function avatarTimelineLabelForShape(shape?: unknown): string {
  const species = String(shape || "rex").trim().toLowerCase() || "rex";
  return avatarTimelineLabels[species] || avatarTimelineLabels.rex;
}

export function playerNameRuntimeText(player: Dict | null): string {
  return String(player?.name || "Player");
}

export function playerVipRuntimeState(player: Dict | null): PlayerVipRuntimeState {
  return { visible: player?.isVip === true };
}

export function playerAnswerBubbleRuntimeState(player: Dict | null, answersShown = true): PlayerAnswerBubbleRuntimeState {
  const displayedAnswer = (player?.displayedAnswer as Dict) || null;
  const text = String(displayedAnswer?.text || "");
  const hasAnswer = Boolean(text && displayedAnswer?.hidden !== true);
  return {
    hasAnswer,
    visible: hasAnswer && answersShown !== false,
    text,
    nonce: String(displayedAnswer?.nonce || ""),
    correctness: displayedAnswer?.correct === true ? "correct" : displayedAnswer?.correct === false ? "wrong" : ""
  };
}

export function runtimeAnswerBubbleComposition(composition: Dict, state: PlayerAnswerBubbleRuntimeState): Dict {
  const fillColor = state.correctness === "correct" ? "#60d394" : state.correctness === "wrong" ? "#d7d3c7" : "";
  const textColor = state.correctness === "wrong" ? "rgba(23, 19, 31, 0.68)" : "";
  return cloneArtComposition(composition, (component) => {
    if (component.id === "answer-text") {
      if (state.hasAnswer) component.defaultText = state.text;
      if (textColor) component.fontColor = textColor;
    }
    if (fillColor && (component.id === "answer-bubble-card" || component.id === "answer-bubble-tail")) {
      component.fillColor = fillColor;
    }
  });
}

export function runtimePlayerNameWidgetComposition(composition: Dict, player: Dict | null): Dict {
  const name = playerNameRuntimeText(player);
  return cloneArtComposition(composition, (component) => {
    component.defaultAnimationState = "on";
    if (component.id === "name-text") component.defaultText = name;
  });
}

export function runtimePlayerVipWidgetComposition(composition: Dict, state: PlayerVipRuntimeState): Dict {
  const animationState = state.visible ? "on" : "park";
  return cloneArtComposition(composition, (component) => {
    component.defaultAnimationState = animationState;
    if (component.id === "vip-text") component.defaultText = "VIP";
  });
}

export function runtimePlayerWidgetComponents(composition: Dict, player: Dict): Dict[] {
  const color = String((player.avatar as Dict)?.color || "#22d3ee");
  const vipState = playerVipRuntimeState(player);
  return ((composition.components as Dict[]) || []).map((component) =>
    cloneArtComponent(component, (clone) => {
      applyRuntimePlayerColor(clone, color);
      if (clone.id === PLAYER_AVATAR_MC_ID || clone.id === "avatar") clone.defaultAnimationState = "On";
      if (clone.id === PLAYER_NAME_MC_ID || clone.id === "player-name") clone.defaultAnimationState = "On";
      if (clone.id === PLAYER_VIP_MC_ID || clone.id === "vip-badge") {
        clone.defaultAnimationState = vipState.visible ? "On" : "Park";
      }
    })
  );
}

export function runtimePlayerAvatarMcComposition(composition: Dict, player: Dict): Dict {
  const color = String((player.avatar as Dict)?.color || "#22d3ee");
  const avatarLabel = avatarTimelineLabelForShape((player.avatar as Dict)?.shape);
  return cloneArtComposition(composition, (component) => {
    applyRuntimePlayerColor(component, color);
    if (component.id === AVATAR_FRAME_ID) component.defaultAnimationState = avatarLabel;
    if (component.id === "avatar-background") component.defaultAnimationState = "On";
  });
}

export function runtimeAvatarsComposition(composition: Dict, player: Dict): Dict {
  const color = String((player.avatar as Dict)?.color || "#22d3ee");
  return cloneArtComposition(composition, (component) => applyRuntimePlayerColor(component, color));
}

class PlayerRosterRenderer {
  host?: El;
  document: Document;
  gameObjectApi: GameObjectApi | undefined;
  timerSink: ((id: number) => void) | null;
  getComposition: (id: string) => Dict | null;
  pointPopupIds = new Set<string>();
  gameObject: GameObjectLike | null = null;
  tileGameObjects = new Map<string, GameObjectLike>();
  tileRenderers = new WeakMap<El, TreeRenderer>();
  tilePlayers = new WeakMap<El, Dict>();
  pointPopupRenderers = new WeakMap<El, TreeRenderer>();
  resizeObserver: ResizeObserver | null = null;
  renderedAnswersShown = true;
  answerAnimationEndsAt = 0;
  rosterHideTimer: number | null = null;

  constructor(options: Dict = {}) {
    this.host = options.host as El | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.gameObjectApi = (options.gameObjectApi as GameObjectApi) || (w().PartyGameGameObject as GameObjectApi) || (w().PartyGameStageGameObject as GameObjectApi);
    this.timerSink = fn(options.timerSink) ? (options.timerSink as (id: number) => void) : null;
    this.getComposition = fn(options.getComposition)
      ? (options.getComposition as (id: string) => Dict | null)
      : (id: string) => w().artComposition?.(id) || null;
    this.observeHostSize();
  }

  observeHostSize(): void {
    if (!this.host || typeof ResizeObserver !== "function") return;
    this.resizeObserver = new ResizeObserver(() => this.layoutTiles());
    this.resizeObserver.observe(this.host);
  }

  playerSignature(player: Dict): string {
    return JSON.stringify({ id: player.id || "" });
  }

  createTile(player: Dict, playerIndex: number, signature: string): El {
    const tile = this.document.createElement("article");
    tile.className = "player-tile";
    tile.classList.toggle("needs-input", player.needsInput === true);
    tile.dataset.playerId = player.id as string;
    tile.dataset.signature = signature;
    tile.style.setProperty("--player-index", String(playerIndex));
    tile.append(this.createPlayerObjectNode());
    this.syncTileGameObject(tile, player);
    this.syncPlayerObject(tile, player, { instant: true });
    return tile;
  }

  createPlayerObjectNode(): El {
    const object = this.document.createElement("div");
    object.className = "player-object-art-host";
    object.dataset.playerPart = "player-object";
    return object;
  }

  playerObjectCompositionFor(player: Dict): Dict | null {
    const legacyId = legacyPlayerObjectCompositionIdForShape((player.avatar as Dict)?.shape);
    return this.getComposition(PLAYER_WIDGET_COMPOSITION_ID) || this.getComposition(legacyId) || this.getComposition("player-object-rex");
  }

  usesPlayerWidgetMc(tile: El): boolean {
    return tile.dataset.playerObjectCompositionId === PLAYER_WIDGET_COMPOSITION_ID;
  }

  componentId(tile: El, modernId: string, legacyId: string): string {
    return this.usesPlayerWidgetMc(tile) ? modernId : legacyId;
  }

  answerStateFor(player: Dict): PlayerAnswerBubbleRuntimeState {
    return playerAnswerBubbleRuntimeState(player, this.renderedAnswersShown);
  }

  compositionResolverFor(tile: El): (id: string) => Dict | null {
    return (id: string) => {
      const composition = this.getComposition(id);
      if (!composition) return null;
      const player = this.tilePlayers.get(tile) || {};
      const color = String((player.avatar as Dict)?.color || "#22d3ee");
      if (id === "player-answer-bubble") return runtimeAnswerBubbleComposition(composition, this.answerStateFor(player));
      if (id === "player-name-widget") return runtimePlayerNameWidgetComposition(composition, player);
      if (id === "player-vip-widget") return runtimePlayerVipWidgetComposition(composition, playerVipRuntimeState(player));
      if (id === "prefab-player-avatar-mc") return runtimePlayerAvatarMcComposition(composition, player);
      if (id === "avatars") return runtimeAvatarsComposition(composition, player);
      return cloneArtComposition(composition, (component) => applyRuntimePlayerColor(component, color));
    };
  }

  rendererFor(tile: El): TreeRenderer | null {
    let renderer = this.tileRenderers.get(tile);
    if (renderer) return renderer;
    const artRuntime = w().PartyGameArtObject as unknown as { ArtObjectTreeRenderer?: new (options: Dict) => TreeRenderer } | undefined;
    const host = tile.querySelector(":scope > .player-object-art-host") as El | null;
    if (!host || !artRuntime?.ArtObjectTreeRenderer) return null;
    renderer = new artRuntime.ArtObjectTreeRenderer({
      host,
      document: this.document,
      instanceId: `player-object:${tile.dataset.playerId || Math.random().toString(36).slice(2)}`,
      gameObjectApi: this.gameObjectApi,
      visualAnimation: w().PartyGameVisualObject,
      getComposition: this.compositionResolverFor(tile)
    });
    this.tileRenderers.set(tile, renderer);
    return renderer;
  }

  syncPlayerObject(tile: El | null, player: Dict, options: Dict = {}): number {
    if (!tile) return 0;
    const host = tile.querySelector(":scope > .player-object-art-host") as El | null;
    const composition = this.playerObjectCompositionFor(player);
    const renderer = this.rendererFor(tile);
    if (!host || !composition || !renderer) return 0;

    this.tilePlayers.set(tile, player);
    const canvas = (composition.canvas as Dict) || { width: 300, height: 300 };
    const canvasWidth = Math.max(1, Number(canvas.width || 300));
    const canvasHeight = Math.max(1, Number(canvas.height || 300));
    const color = String((player.avatar as Dict)?.color || "#22d3ee");
    const answerState = this.answerStateFor(player);
    host.style.width = `${canvasWidth}px`;
    host.style.height = `${canvasHeight}px`;
    host.style.color = color;
    tile.style.setProperty("--player-object-width", `${canvasWidth}px`);
    tile.style.setProperty("--player-object-height", `${canvasHeight}px`);
    tile.style.setProperty("--avatar-color", color);
    tile.dataset.playerObjectWidth = String(canvasWidth);
    tile.dataset.playerObjectHeight = String(canvasHeight);
    tile.dataset.playerObjectScale = "1";
    tile.dataset.playerObjectCompositionId = String(composition.id || "");

    const previousVisible = tile.dataset.answerBubbleVisible === "true";
    const previousNonce = tile.dataset.answerBubbleNonce || "";
    const previousText = tile.dataset.answerBubbleText || "";
    const previousCorrectness = tile.dataset.answerBubbleCorrectness || "";
    const previousPlayerName = tile.dataset.playerName || "";
    const previousPlayerVip = tile.dataset.playerVip === "true";

    renderer.render(runtimePlayerWidgetComponents(composition, player), canvas, {
      defaultAnimation: "On",
      instant: true,
      respectDefaultAnimationState: true
    });

    const avatarDuration = this.syncAvatarComponent(tile, renderer, player);

    const duration = this.syncAnswerBubbleComponent(tile, renderer, answerState, {
      ...options,
      previousVisible,
      previousNonce,
      previousText,
      previousCorrectness
    });
    const labelDuration = this.syncPlayerLabelComponents(renderer, player, {
      ...options,
      tile,
      previousPlayerName,
      previousPlayerVip
    });
    tile.dataset.answerBubbleHasAnswer = answerState.hasAnswer ? "true" : "false";
    tile.dataset.answerBubbleVisible = answerState.visible ? "true" : "false";
    tile.dataset.answerBubbleNonce = answerState.nonce;
    tile.dataset.answerBubbleText = answerState.text;
    tile.dataset.answerBubbleCorrectness = answerState.correctness;
    tile.dataset.playerName = playerNameRuntimeText(player);
    tile.dataset.playerVip = playerVipRuntimeState(player).visible ? "true" : "false";
    tile.dataset.playerAvatarShape = String((player.avatar as Dict)?.shape || "rex");
    this.layoutTiles();
    return Math.max(duration, labelDuration, avatarDuration);
  }

  syncAvatarComponent(tile: El, renderer: TreeRenderer, player: Dict): number {
    if (!this.usesPlayerWidgetMc(tile)) return 0;
    const label = avatarTimelineLabelForShape((player.avatar as Dict)?.shape);
    return renderer.stopAtComponent?.(AVATAR_FRAME_ID, label, { instant: true }) || 0;
  }

  syncAnswerBubbleComponent(tile: El, renderer: TreeRenderer, state: PlayerAnswerBubbleRuntimeState, options: Dict = {}): number {
    const instant = options.instant === true;
    const previousVisible = options.previousVisible === true;
    const previousNonce = String(options.previousNonce || "");
    const previousText = String(options.previousText || "");
    const previousCorrectness = String(options.previousCorrectness || "");
    const targetId = this.componentId(tile, PLAYER_ANSWER_BUBBLE_MC_ID, "answer-bubble");
    const play = (animation: string) =>
      (this.usesPlayerWidgetMc(tile)
        ? renderer.playComponent?.(targetId, animation, { instant })
        : renderer.playComponentTree?.(targetId, animation, { instant })) || 0;

    if (!state.visible) {
      if (previousVisible || renderer.isComponentVisible?.(targetId)) return play(instant ? "Park" : "Disappear");
      return play("Park");
    }
    if (!previousVisible || !renderer.isComponentVisible?.(targetId)) return play("Appear");
    if (previousNonce !== state.nonce || previousText !== state.text || previousCorrectness !== state.correctness) return play("Update");
    return 0;
  }

  syncPlayerLabelComponents(renderer: TreeRenderer, player: Dict, options: Dict = {}): number {
    const tile = options.tile as El | undefined;
    if (!tile) return 0;
    const instant = options.instant === true;
    const previousPlayerName = String(options.previousPlayerName || "");
    const previousPlayerVip = options.previousPlayerVip === true;
    const playerName = playerNameRuntimeText(player);
    const vipState = playerVipRuntimeState(player);
    const nameId = this.componentId(tile, PLAYER_NAME_MC_ID, "player-name");
    const vipId = this.componentId(tile, PLAYER_VIP_MC_ID, "vip-badge");
    const play = (componentId: string, animation: string) =>
      (this.usesPlayerWidgetMc(tile)
        ? renderer.playComponent?.(componentId, animation, { instant })
        : renderer.playComponentTree?.(componentId, animation, { instant })) || 0;
    let duration = 0;
    if (previousPlayerName && previousPlayerName !== playerName && renderer.isComponentVisible?.(nameId)) {
      duration = Math.max(duration, play(nameId, "Update"));
    }
    const vipVisible = renderer.isComponentVisible?.(vipId) === true;
    if (vipState.visible) {
      if (!previousPlayerVip || !vipVisible) duration = Math.max(duration, play(vipId, instant ? "On" : "Appear"));
    } else if (previousPlayerVip || vipVisible) {
      duration = Math.max(duration, play(vipId, instant ? "Park" : "Disappear"));
    }
    return duration;
  }

  syncTileGameObject(tile: El | null, player: Dict): GameObjectLike | null {
    if (!tile || typeof this.gameObjectApi?.create !== "function") return null;
    const playerId = String(player?.id || tile.dataset.playerId || "");
    if (!playerId) return null;
    const options: Dict = {
      id: `player-tile-${playerId}`,
      target: tile,
      visibilityKey: `player:${playerId}`,
      visualOptions: {
        hiddenClasses: ["player-tile-hidden"],
        motionHiddenClasses: ["player-tile-hidden"],
        instantClass: "players-instant",
        layoutHiddenClasses: ["player-tile-hidden"],
        transformOrigin: "center center"
      },
      getVisible: () => !tile.classList.contains("player-tile-hidden"),
      setVisible: (isVisible: boolean) => {
        tile.dataset.visualVisible = isVisible ? "true" : "false";
      },
      timerSink: this.timerSink
    };
    const existing = this.tileGameObjects.get(playerId);
    const gameObject = existing?.target === tile ? existing.update(options) : createGameObject(this.gameObjectApi, options);
    if (gameObject) this.tileGameObjects.set(playerId, gameObject);
    return gameObject;
  }

  existingTilesByPlayerId(): Map<string, El> {
    return new Map(
      Array.from(this.host?.querySelectorAll(".player-tile[data-player-id]") || []).map((tile) => [
        (tile as El).dataset.playerId as string,
        tile as El
      ])
    );
  }

  render(players: Dict[] = []): void {
    if (!this.host) return;
    const existingTiles = this.existingTilesByPlayerId();
    const desiredIds = new Set(players.map((player) => player.id as string));
    let cursor = this.host.firstElementChild;
    players.forEach((player, playerIndex) => {
      const signature = this.playerSignature(player);
      const existing = existingTiles.get(player.id as string);
      const tile = existing?.dataset.signature === signature ? existing : this.createTile(player, playerIndex, signature);
      tile.classList.toggle("needs-input", player.needsInput === true);
      tile.style.setProperty("--player-index", String(playerIndex));
      this.syncTileGameObject(tile, player);
      if (existing && existing !== tile) {
        if (existing === cursor) cursor = existing.nextElementSibling;
        this.tileGameObjects.delete(String(player.id || ""));
        existing.remove();
      }
      if (tile === cursor) {
        cursor = cursor.nextElementSibling;
      } else {
        this.host!.insertBefore(tile, cursor);
      }
      this.syncPlayerObject(tile, player);
    });
    Array.from(this.host.querySelectorAll(".player-tile[data-player-id]")).forEach((node) => {
      const tile = node as El;
      if (!desiredIds.has(tile.dataset.playerId as string)) {
        this.tileGameObjects.delete(String(tile.dataset.playerId || ""));
        tile.remove();
      }
    });
    this.layoutTiles();
  }

  layoutTiles(): void {
    if (!this.host) return;
    const tiles = Array.from(this.host.querySelectorAll(":scope > .player-tile[data-player-id]")) as El[];
    if (!tiles.length) return;
    const containerWidth = elementDimension(this.host, "width", 1);
    const containerHeight = elementDimension(this.host, "height", 116);
    const positions = distributedContainerItemPositions(
      { width: containerWidth, height: containerHeight },
      tiles.map(tileDistributionSize),
      "horizontal"
    );
    tiles.forEach((tile, index) => {
      const position = positions[index];
      if (!position) return;
      tile.style.left = `${position.x}px`;
      tile.style.top = `${position.y}px`;
    });
  }

  visibilityDuration(options: Dict = {}): number {
    if (options.instant === true) return 0;
    const playerCount = this.host?.querySelectorAll(".player-tile").length || 0;
    return 1000 + Math.max(0, playerCount - 1) * 45;
  }

  playerWidgetTiles(): El[] {
    if (!this.host) return [];
    return (Array.from(this.host.querySelectorAll(":scope > .player-tile[data-player-id]")) as El[]).filter((tile) =>
      this.usesPlayerWidgetMc(tile)
    );
  }

  setRosterHostHidden(hidden: boolean): void {
    if (!this.host) return;
    this.host.classList.add("players-instant");
    this.host.classList.toggle("players-hidden", hidden);
    void this.host.offsetWidth;
    this.host.classList.remove("players-instant");
    this.host.dataset.visualVisible = hidden ? "false" : "true";
  }

  playPlayerWidgetVisibility(tile: El, isShown: boolean, options: Dict = {}): number {
    const renderer = this.tileRenderers.get(tile);
    const player = this.tilePlayers.get(tile);
    if (!renderer || !player) return 0;
    const instant = options.instant === true;
    const animation = isShown ? (instant ? "On" : "Appear") : instant ? "Park" : "Disappear";
    let duration = 0;
    for (const componentId of [PLAYER_AVATAR_MC_ID, PLAYER_NAME_MC_ID]) {
      duration = Math.max(duration, renderer.playComponent?.(componentId, animation, { instant }) || 0);
    }
    if (playerVipRuntimeState(player).visible) {
      duration = Math.max(duration, renderer.playComponent?.(PLAYER_VIP_MC_ID, animation, { instant }) || 0);
    }
    return duration;
  }

  gameObjectForRoster(options: Dict = {}): GameObjectLike | null {
    if (!this.host) return null;
    const duration = this.visibilityDuration(options);
    const gameObjectOptions: Dict = {
      id: this.host.id || "playerLobby",
      target: this.host,
      visibilityKey: `widget:${this.host.id || "playerLobby"}`,
      visualOptions: {
        hiddenClasses: ["players-hidden"],
        motionHiddenClasses: ["players-hidden"],
        instantClass: "players-instant",
        layoutHiddenClasses: ["players-hidden"],
        durations: { appear: duration, disappear: duration }
      },
      getVisible: () => !this.host!.classList.contains("players-hidden"),
      setVisible: (isVisible: boolean) => {
        this.host!.dataset.visualVisible = isVisible ? "true" : "false";
      },
      timerSink: this.timerSink
    };
    if (!this.gameObject || this.gameObject.target !== this.host) {
      this.gameObject = createGameObject(this.gameObjectApi, gameObjectOptions);
    } else {
      this.gameObject.update(gameObjectOptions);
    }
    return this.gameObject;
  }

  setShown(isShown: boolean, options: Dict = {}): number {
    if (!this.host) return 0;
    const targetShown = isShown !== false;
    const widgetTiles = this.playerWidgetTiles();
    const alreadyShown = widgetTiles.length > 0 && this.host.dataset.visualVisible
      ? this.host.dataset.visualVisible === "true"
      : !this.host.classList.contains("players-hidden");
    if (alreadyShown === targetShown) {
      this.host.dataset.visualVisible = targetShown ? "true" : "false";
      return 0;
    }
    const instant = options.instant === true;
    if (widgetTiles.length > 0) {
      if (this.rosterHideTimer !== null) {
        globalThis.clearTimeout(this.rosterHideTimer);
        this.rosterHideTimer = null;
      }
      if (targetShown) this.setRosterHostHidden(false);
      let duration = 0;
      for (const tile of widgetTiles) {
        duration = Math.max(duration, this.playPlayerWidgetVisibility(tile, targetShown, { instant }));
      }
      if (!targetShown) {
        if (duration > 0 && !instant) {
          const timerId = globalThis.setTimeout(() => {
            this.rosterHideTimer = null;
            this.setRosterHostHidden(true);
          }, duration);
          this.rosterHideTimer = Number(timerId);
          this.timerSink?.(Number(timerId));
        } else {
          this.setRosterHostHidden(true);
        }
      }
      this.host.dataset.visualVisible = targetShown ? "true" : "false";
      return duration;
    }
    const gameObject = this.gameObjectForRoster(options);
    if (gameObject) return gameObject.playVisibility(targetShown, { instant });
    this.host.classList.toggle("players-hidden", !targetShown);
    this.host.classList.toggle("players-instant", instant);
    return this.visibilityDuration({ ...options, instant });
  }

  currentAnswerBubblesShown(): boolean {
    return this.renderedAnswersShown !== false;
  }

  answerBubbleAnimationRemaining(): number {
    return Math.max(0, this.answerAnimationEndsAt - Date.now());
  }

  hasParkedShownBubbles(): boolean {
    if (!this.currentAnswerBubblesShown() || !this.host) return false;
    return Array.from(this.host.querySelectorAll(".player-tile[data-answer-bubble-has-answer='true']")).some((node) => {
      const tile = node as El;
      const targetId = this.componentId(tile, PLAYER_ANSWER_BUBBLE_MC_ID, "answer-bubble");
      return this.tileRenderers.get(tile)?.isComponentVisible?.(targetId) !== true;
    });
  }

  resetAnswerBubbles(): void {
    this.renderedAnswersShown = true;
    this.answerAnimationEndsAt = 0;
  }

  setAnswerBubblesShown(isShown: boolean, options: Dict = {}): number {
    if (!this.host) return 0;
    const instant = options.instant === true;
    const remainingDuration = this.answerBubbleAnimationRemaining();
    const wasShown = this.currentAnswerBubblesShown();
    this.renderedAnswersShown = isShown !== false;
    if (!instant && wasShown === this.renderedAnswersShown && remainingDuration > 0) return remainingDuration;

    let duration = 0;
    for (const node of Array.from(this.host.querySelectorAll(".player-tile[data-player-id]"))) {
      const tile = node as El;
      const player = this.tilePlayers.get(tile);
      if (player) duration = Math.max(duration, this.syncPlayerObject(tile, player, { instant }));
    }
    this.answerAnimationEndsAt = duration > 0 ? Date.now() + duration : 0;
    return duration;
  }

  tileForPlayerId(playerId: unknown): El | null {
    if (!this.host || !playerId) return null;
    return this.host.querySelector(`.player-tile[data-player-id="${CSS.escape(String(playerId))}"]`);
  }

  renderPointPopups(popups: Dict[] = []): void {
    for (const popup of popups || []) {
      if (!popup?.id || this.pointPopupIds.has(popup.id as string)) continue;
      const tile = this.tileForPlayerId(popup.playerId);
      if (!tile) continue;
      this.pointPopupIds.add(popup.id as string);
      const node = this.document.createElement("div");
      node.className = "point-popup point-popup-hidden";
      node.dataset.pointPopupId = popup.id as string;
      this.renderPointPopupPrefab(node, popup);
      tile.appendChild(node);
      this.playPointPopup(node, popup);
    }
  }

  clonePrefabComponent(component: Dict, overrides: Dict = {}): Dict {
    const clone: Dict = {
      ...component,
      children: ((component.children as Dict[]) || []).map((child) => this.clonePrefabComponent(child, overrides))
    };
    const text = (overrides.text as Dict)?.[clone.id as string];
    if (text !== undefined && (clone.kind === "text" || clone.kind === "badge")) clone.defaultText = String(text ?? "");
    if ((overrides.props as Dict)?.[clone.id as string]) Object.assign(clone, (overrides.props as Dict)[clone.id as string]);
    return clone;
  }

  renderPointPopupPrefab(node: El, popup: Dict): boolean {
    const text = `+${Math.max(0, Math.floor(Number(popup?.points || 0)))}`;
    const composition = this.getComposition?.("player-point-popup");
    const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer } | undefined;
    if (!node || !composition || !artRuntime?.ArtObjectTreeRenderer) {
      renderStageTextBox(node, text, { width: 120, height: 46, fontSize: 34, fontColor: "var(--yellow)" });
      return false;
    }
    node.classList.add("has-prefab-art");
    const canvas = (composition.canvas as Dict) || { width: 150, height: 60 };
    node.style.width = `${Math.max(1, Number(canvas.width || 1))}px`;
    node.style.height = `${Math.max(1, Number(canvas.height || 1))}px`;
    const components = ((composition.components as Dict[]) || []).map((component) =>
      this.clonePrefabComponent(component, { text: { "point-text": text, "point-shadow": text } })
    );
    let renderer = this.pointPopupRenderers.get(node);
    if (!renderer) {
      renderer = new artRuntime.ArtObjectTreeRenderer({
        host: node,
        document: this.document,
        instanceId: `point-popup:${popup?.id || Math.random().toString(36).slice(2)}`,
        gameObjectApi: this.gameObjectApi,
        visualAnimation: w().PartyGameVisualObject,
        getComposition: this.getComposition
      });
      this.pointPopupRenderers.set(node, renderer);
    }
    renderer.render(components, canvas, {
      defaultAnimation: "on",
      instant: true,
      timeline: pointPopupTimeline(composition),
      respectDefaultAnimationState: false
    });
    return true;
  }

  playPointPopup(node: El, popup: Dict): number {
    if (!node || !popup?.id) return 0;
    const renderer = this.pointPopupRenderers.get(node);
    if (!renderer?.playAll) {
      node.classList.remove("point-popup-hidden");
      node.classList.add("is-floating");
      setTimeout(() => node.remove(), 1600);
      return 1500;
    }
    node.classList.remove("point-popup-hidden");
    const duration = renderer.playAll("appear", { instant: false });
    const removeDelay = Math.max(0, duration || 0);
    const timeoutId = globalThis.setTimeout(() => node.remove(), removeDelay);
    this.timerSink?.(Number(timeoutId));
    return removeDelay;
  }

  clearPointPopupIds(): void {
    this.pointPopupIds.clear();
  }

  clearPointPopups(): void {
    this.clearPointPopupIds();
    this.host?.querySelectorAll(".point-popup").forEach((node) => node.remove());
  }
}

export const PartyGamePlayerRoster = {
  PlayerRosterRenderer,
  createRenderer: (options?: Dict) => new PlayerRosterRenderer(options)
};

export function installStagePlayerRosterGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGamePlayerRoster = PartyGamePlayerRoster;
}

installStagePlayerRosterGlobals(typeof window !== "undefined" ? window : globalThis);
