// Typed port of the legacy client/stage/player-roster-renderer.js IIFE — the stage
// player tile roster + point popups. Installs window.PartyGamePlayerRoster for the
// legacy stage runtime. PartyGame* + artComposition deps are read lazily via
// globalThis at call time.

import { distributedContainerItemPositions, type DistributedItemSize } from "./distributedContainerLayout";
import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import { timelineSnapshotAt } from "./timelinePlayer";
import { defaultPlayerPointPopupTimeline } from "../../shared/player-point-popup-timeline";
import type { TimelineDocument } from "../../shared/timeline-model";
import { createActionCompletionBarrier } from "./actionCompletionBarrier";

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
  componentLifecycleState?: (componentId: string) => string;
  isComponentVisible?: (componentId: string) => boolean;
  playAll?: (animation: string, options?: Dict) => number;
  playComponent?: (componentId: string, animation: string, options?: Dict) => number;
  stopAtComponent?: (componentId: string, animation: string, options?: Dict) => number;
  dispose?: () => void;
}

declare global {
  interface Window {
    PartyGamePlayerRoster?: typeof PartyGamePlayerRoster;
  }
}

const w = () => globalThis as typeof globalThis & Window;

export const PLAYER_WIDGET_COMPOSITION_ID = "prefab-player-widget-mc";
// Runtime commands target authored instance labels, not generated component ids.
// The current Player Widget MC may replace or regenerate its references without
// breaking the voice-answer path as long as these public labels stay intact.
const PLAYER_ANSWER_BUBBLE_MC_ID = "playerAnswerBubbleMC";
const PLAYER_ANSWER_BUBBLE_STATE_ID = "playerAnswerBubble";
const PLAYER_AVATAR_MC_ID = "playerAvatarMC";
const PLAYER_AVATAR_BEHAVIORS_ID = "playerAvatarBehaviors";
const PLAYER_NAME_MC_ID = "playerNameMC";
const PLAYER_VIP_MC_ID = "vipMC";
const AVATAR_FRAME_ID = "avatar";
const POINT_POPUP_CONTAINER_INSTANCE_LABEL = "pointPopupContainer";
const POINT_POPUP_CONTAINER_LEGACY_ID = "point-popup-container";
const POINT_POPUP_COMPOSITION_ID = "player-point-popup";

type RectLike = { left: number; top: number; width: number; height: number };

type PointLike = { x: number; y: number };

export function authoredCanvasPointViewportPosition(
  point: PointLike,
  canvas: { width: number; height: number; minX?: number; minY?: number },
  canvasRect: RectLike
): PointLike {
  const canvasWidth = Math.max(1, Number(canvas.width || 1));
  const canvasHeight = Math.max(1, Number(canvas.height || 1));
  const canvasMinX = Number(canvas.minX || 0);
  const canvasMinY = Number(canvas.minY || 0);
  return {
    x: canvasRect.left + ((Number(point.x || 0) - canvasMinX) / canvasWidth) * canvasRect.width,
    y: canvasRect.top + ((Number(point.y || 0) - canvasMinY) / canvasHeight) * canvasRect.height
  };
}

export function playerWidgetPointPopupAnchorPosition(composition: Dict | null): PointLike | null {
  if (!composition) return null;
  const components = [...((composition.components as Dict[]) || [])];
  let anchor: Dict | undefined;
  while (components.length && !anchor) {
    const component = components.shift();
    if (!component) continue;
    if (component.instanceLabel === POINT_POPUP_CONTAINER_INSTANCE_LABEL || component.id === POINT_POPUP_CONTAINER_LEGACY_ID) anchor = component;
    else components.push(...((component.children as Dict[]) || []));
  }
  if (!anchor) return null;
  const position = {
    x: Number(anchor.x || 0),
    y: Number(anchor.y || 0)
  };
  const timeline = composition.timeline as TimelineDocument | null | undefined;
  if (!timeline?.labels?.length || !timeline?.tracks?.length) return position;
  const onFrame = timeline.labels.find((label) => String(label?.name || "").trim().toLowerCase() === "on")?.frame ?? 0;
  const timelineTargets = timelineSnapshotAt(timeline, onFrame).targets;
  const timelinePosition = timelineTargets[String(anchor.id || "")]
    || timelineTargets[POINT_POPUP_CONTAINER_INSTANCE_LABEL]
    || timelineTargets[POINT_POPUP_CONTAINER_LEGACY_ID];
  const timelineX = Number(timelinePosition?.x);
  const timelineY = Number(timelinePosition?.y);
  return {
    x: Number.isFinite(timelineX) ? timelineX : position.x,
    y: Number.isFinite(timelineY) ? timelineY : position.y
  };
}

export function pointPopupOverlayPosition(
  anchorRect: RectLike,
  hostRect: RectLike,
  hostSize: { width: number; height: number }
): { left: number; top: number } {
  const scaleX = hostRect.width > 0 && hostSize.width > 0 ? hostRect.width / hostSize.width : 1;
  const scaleY = hostRect.height > 0 && hostSize.height > 0 ? hostRect.height / hostSize.height : 1;
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  return {
    left: (anchorCenterX - hostRect.left) / scaleX,
    top: (anchorCenterY - hostRect.top) / scaleY
  };
}

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
    components: ((composition.components as Dict[]) || []).map((component) => cloneArtComponent(component, apply)),
    timeline: composition.timeline ? structuredClone(composition.timeline) : composition.timeline
  };
}

function pointPopupTimeline(composition: Dict): TimelineDocument {
  const authored = composition.timeline as TimelineDocument | null | undefined;
  const hasPopup = authored?.labels?.some((label) => String(label?.name || "").trim().toLowerCase() === "popup") === true;
  return authored && hasPopup
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
  const hasAnswer = Boolean(text);
  return {
    hasAnswer,
    visible: hasAnswer && displayedAnswer?.hidden !== true && answersShown !== false,
    text,
    nonce: String(displayedAnswer?.nonce || ""),
    correctness: displayedAnswer?.correct === true ? "correct" : displayedAnswer?.correct === false ? "wrong" : ""
  };
}

export function playerMatchesAnswerFilter(player: Dict | null, playerFilter: unknown): boolean {
  const filter = String(playerFilter || "all").trim().toLowerCase();
  const answer = (player?.displayedAnswer as Dict) || null;
  if (filter === "correct") return answer?.correct === true;
  if (filter === "wrong") return answer?.correct === false;
  return true;
}

function tileMatchesAnswerFilter(tile: El, player: Dict | null, playerFilter: string): boolean {
  if (playerFilter === "correct" || playerFilter === "wrong") {
    const renderedCorrectness = String(tile.dataset.answerBubbleCorrectness || "");
    if (renderedCorrectness) return renderedCorrectness === playerFilter;
  }
  return playerMatchesAnswerFilter(player, playerFilter);
}

export function runtimeAnswerBubbleComposition(composition: Dict, state: PlayerAnswerBubbleRuntimeState): Dict {
  let answerTextTargetId = "";
  const runtime = cloneArtComposition(composition, (component) => {
    const isAnswerText = component.id === "answer-text"
      || component.instanceLabel === "answerText"
      || String(component.name || "").trim().toLowerCase() === "answer text";
    if (!isAnswerText || !state.hasAnswer) return;
    component.defaultText = state.text;
    answerTextTargetId = String(component.id || "");
  });
  if (!state.hasAnswer) return runtime;
  const timeline = runtime.timeline as Dict | undefined;
  for (const track of (timeline?.tracks as Dict[]) || []) {
    if (!answerTextTargetId || track.targetId !== answerTextTargetId) continue;
    for (const keyframe of (track.keyframes as Dict[]) || []) {
      keyframe.props = { ...((keyframe.props as Dict) || {}), defaultText: state.text };
    }
  }
  return runtime;
}

export function playerAnswerBubbleStateLabel(state: PlayerAnswerBubbleRuntimeState): "Default" | "Correct" | "Incorrect" {
  if (state.correctness === "correct") return "Correct";
  if (state.correctness === "wrong") return "Incorrect";
  return "Default";
}

export function runtimePlayerNameWidgetComposition(composition: Dict, player: Dict | null): Dict {
  const name = playerNameRuntimeText(player);
  return cloneArtComposition(composition, (component) => {
    if (component.id === "name-text") component.defaultText = name;
  });
}

export function runtimePlayerVipWidgetComposition(composition: Dict): Dict {
  return cloneArtComposition(composition, (component) => {
    if (component.id === "vip-text") component.defaultText = "VIP";
  });
}

export function runtimePlayerWidgetComponents(composition: Dict, player: Dict): Dict[] {
  const color = String((player.avatar as Dict)?.color || "#22d3ee");
  return ((composition.components as Dict[]) || []).map((component) =>
    cloneArtComponent(component, (clone) => {
      applyRuntimePlayerColor(clone, color);
    })
  );
}

export function runtimePlayerAvatarMcComposition(composition: Dict, player: Dict): Dict {
  const color = String((player.avatar as Dict)?.color || "#22d3ee");
  return cloneArtComposition(composition, (component) => {
    applyRuntimePlayerColor(component, color);
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
  tileGameObjects = new Map<string, GameObjectLike>();
  tileRenderers = new WeakMap<El, TreeRenderer>();
  tilePlayers = new WeakMap<El, Dict>();
  pointPopupRenderers = new WeakMap<El, TreeRenderer>();
  resizeObserver: ResizeObserver | null = null;
  renderedAnswersShown = false;
  liveAnswerPreviewEnabled = false;

  constructor(options: Dict = {}) {
    this.host = options.host as El | undefined;
    this.host?.classList?.remove("players-hidden", "players-instant");
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

  playerObjectCompositionFor(_player: Dict): Dict | null {
    return this.getComposition(PLAYER_WIDGET_COMPOSITION_ID);
  }

  answerStateFor(player: Dict): PlayerAnswerBubbleRuntimeState {
    return playerAnswerBubbleRuntimeState(player, this.renderedAnswersShown || this.liveAnswerPreviewEnabled);
  }

  compositionResolverFor(tile: El): (id: string) => Dict | null {
    return (id: string) => {
      const composition = this.getComposition(id);
      if (!composition) return null;
      const player = this.tilePlayers.get(tile) || {};
      const color = String((player.avatar as Dict)?.color || "#22d3ee");
      if (id === "player-answer-bubble" || String(composition.name || "").trim().toLowerCase() === "player answer bubble") {
        return runtimeAnswerBubbleComposition(composition, this.answerStateFor(player));
      }
      if (id === "player-name-widget") return runtimePlayerNameWidgetComposition(composition, player);
      if (id === "player-vip-widget") return runtimePlayerVipWidgetComposition(composition);
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

    const previousNeedsInput = tile.dataset.playerNeedsInput;
    const isInitialRender = previousNeedsInput === undefined;
    const previousAnswerVisible = tile.dataset.answerBubbleVisible === "true";
    const previousAnswerNonce = tile.dataset.answerBubbleNonce || "";
    const previousAnswerText = tile.dataset.answerBubbleText || "";
    const previousAnswerCorrectness = tile.dataset.answerBubbleCorrectness || "";

    renderer.render(runtimePlayerWidgetComponents(composition, player), canvas, {
      instant: true
    });

    // Reconciliation may refresh authored component data while an action-selected
    // semantic frame is parked. Preserve the state selected by Reveal Player
    // Answer Correctness; do not derive or initiate a new state from room data.
    // A different answer identity starts clean at Default.
    if (previousAnswerCorrectness) {
      const sameAnswer = previousAnswerNonce === answerState.nonce && previousAnswerText === answerState.text;
      renderer.stopAtComponent?.(
        PLAYER_ANSWER_BUBBLE_STATE_ID,
        sameAnswer ? (previousAnswerCorrectness === "correct" ? "Correct" : "Incorrect") : "Default",
        { instant: true }
      );
      if (!sameAnswer) tile.dataset.answerBubbleCorrectness = "";
    }

    const avatarStateDuration = this.syncAvatarComponent(renderer, player);
    this.syncAvatarBehaviorComponent(renderer, player, {
      ...options,
      previousNeedsInput
    });
    if (isInitialRender) this.playSpawnedPlayerWidget(renderer, player);
    if (options.reconcileLiveAnswerPreview === true) {
      this.syncAnswerBubbleComponent(renderer, answerState, {
        instant: isInitialRender || options.instant === true,
        previousVisible: previousAnswerVisible,
        previousNonce: previousAnswerNonce,
        previousText: previousAnswerText,
        updateOnContentChange: true
      });
    }
    tile.dataset.answerBubbleHasAnswer = answerState.hasAnswer ? "true" : "false";
    tile.dataset.answerBubbleVisible = answerState.visible ? "true" : "false";
    if (isInitialRender) tile.dataset.answerBubbleCorrectness = "";
    tile.dataset.answerBubbleNonce = answerState.nonce;
    tile.dataset.answerBubbleText = answerState.text;
    tile.dataset.playerName = playerNameRuntimeText(player);
    tile.dataset.playerVip = playerVipRuntimeState(player).visible ? "true" : "false";
    tile.dataset.playerNeedsInput = player.needsInput === true ? "true" : "false";
    tile.dataset.playerAvatarShape = String((player.avatar as Dict)?.shape || "rex");
    this.layoutTiles();
    void avatarStateDuration;
    return 0;
  }

  syncAvatarComponent(renderer: TreeRenderer, player: Dict): number {
    const label = avatarTimelineLabelForShape((player.avatar as Dict)?.shape);
    return renderer.stopAtComponent?.(AVATAR_FRAME_ID, label, { instant: true }) || 0;
  }

  syncAvatarBehaviorComponent(renderer: TreeRenderer, player: Dict, options: Dict = {}): number {
    const instant = options.instant === true;
    const previousNeedsInput = options.previousNeedsInput;
    const needsInput = player.needsInput === true;
    if (previousNeedsInput === undefined) {
      if (needsInput) renderer.playComponent?.(PLAYER_AVATAR_BEHAVIORS_ID, "ChoosingStart", { instant });
      else renderer.stopAtComponent?.(PLAYER_AVATAR_BEHAVIORS_ID, "Default", { instant: true });
      return 0;
    }
    if ((previousNeedsInput === "true") === needsInput) return 0;
    renderer.playComponent?.(
      PLAYER_AVATAR_BEHAVIORS_ID,
      needsInput ? "ChoosingStart" : "ChoosingEnd",
      { instant }
    );
    return 0;
  }

  syncAnswerBubbleComponent(renderer: TreeRenderer, state: PlayerAnswerBubbleRuntimeState, options: Dict = {}): number {
    const instant = options.instant === true;
    const targetId = PLAYER_ANSWER_BUBBLE_MC_ID;
    const lifecycleState = renderer.componentLifecycleState?.(targetId);
    const targetShown = state.visible === true;
    const componentTargetShown = lifecycleState === "shown" || lifecycleState === "appearing"
      ? true
      : lifecycleState === "hidden" || lifecycleState === "disappearing"
        ? false
        : renderer.isComponentVisible?.(targetId);
    const alreadyTargetingVisibility = componentTargetShown === targetShown;
    if (alreadyTargetingVisibility) {
      const previousNonce = String(options.previousNonce || "");
      const previousText = String(options.previousText || "");
      const contentChanged = previousNonce !== state.nonce || previousText !== state.text;
      if (targetShown && options.updateOnContentChange === true && contentChanged) {
        return renderer.playComponent?.(targetId, "Update", { instant }) || 0;
      }
      if (typeof options.complete === "function") (options.complete as () => void)();
      return 0;
    }
    const play = (animation: string, playInstant = instant) => {
      const playOptions: Dict = { instant: playInstant };
      if (typeof options.complete === "function") playOptions.complete = options.complete;
      return renderer.playComponent?.(targetId, animation, playOptions) || 0;
    };
    return state.visible ? play(instant ? "On" : "Appear") : play(instant ? "Off" : "Disappear");
  }

  playSpawnedPlayerWidget(renderer: TreeRenderer, player: Dict): number {
    renderer.playComponent?.(PLAYER_AVATAR_MC_ID, "Appear", { instant: false });
    renderer.playComponent?.(PLAYER_NAME_MC_ID, "Appear", { instant: false });
    if (playerVipRuntimeState(player).visible) {
      renderer.playComponent?.(PLAYER_VIP_MC_ID, "Appear", { instant: false });
    }
    return 0;
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

  render(players: Dict[] = [], options: Dict = {}): void {
    if (!this.host) return;
    const previousLiveAnswerPreviewEnabled = this.liveAnswerPreviewEnabled;
    this.liveAnswerPreviewEnabled = options.liveAnswerPreviewEnabled === true;
    const reconcileLiveAnswerPreview = previousLiveAnswerPreviewEnabled || this.liveAnswerPreviewEnabled;
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
      this.syncPlayerObject(tile, player, { ...options, reconcileLiveAnswerPreview });
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
    this.positionPointPopups();
  }

  playerWidgetTiles(): El[] {
    if (!this.host) return [];
    return Array.from(this.host.querySelectorAll(":scope > .player-tile[data-player-id]")) as El[];
  }

  playPlayerWidgetVisibility(tile: El, isShown: boolean, options: Dict = {}): number {
    const renderer = this.tileRenderers.get(tile);
    const player = this.tilePlayers.get(tile);
    if (!renderer || !player) return 0;
    const instant = options.instant === true;
    const animation = isShown ? (instant ? "On" : "Appear") : instant ? "Off" : "Disappear";
    const avatarComplete = typeof options.complete === "function" ? (options.complete as () => void) : null;
    const avatarOptions: Dict = { instant };
    if (avatarComplete) avatarOptions.complete = avatarComplete;
    const avatarDuration = renderer.playComponent?.(PLAYER_AVATAR_MC_ID, animation, avatarOptions) || 0;
    let duration = Math.max(avatarDuration, renderer.playComponent?.(PLAYER_NAME_MC_ID, animation, { instant }) || 0);
    if (playerVipRuntimeState(player).visible) {
      duration = Math.max(duration, renderer.playComponent?.(PLAYER_VIP_MC_ID, animation, { instant }) || 0);
    }
    return duration;
  }

  setShown(isShown: boolean, options: Dict = {}): number {
    if (!this.host) {
      return 0;
    }
    const targetShown = isShown !== false;
    const widgetTiles = this.playerWidgetTiles();
    const alreadyShown = widgetTiles.length > 0 && this.host.dataset.visualVisible
      ? this.host.dataset.visualVisible === "true"
      : !this.host.classList.contains("players-hidden");
    if (alreadyShown === targetShown) {
      this.host.dataset.visualVisible = targetShown ? "true" : "false";
      if (typeof options.complete === "function") (options.complete as () => void)();
      return 0;
    }
    const instant = options.instant === true;
    if (widgetTiles.length > 0) {
      let duration = 0;
      const barrier = typeof options.complete === "function" ? createActionCompletionBarrier() : null;
      for (const tile of widgetTiles) {
        const playerComplete = barrier?.addTarget();
        const playerDuration = this.playPlayerWidgetVisibility(tile, targetShown, { instant, complete: playerComplete });
        duration = Math.max(duration, playerDuration);
      }
      if (barrier) {
        if (typeof options.complete === "function") barrier.promise.then(options.complete as () => void);
        barrier.seal();
      }
      this.host.dataset.visualVisible = targetShown ? "true" : "false";
      return duration;
    }
    this.host.dataset.visualVisible = targetShown ? "true" : "false";
    if (typeof options.complete === "function") (options.complete as () => void)();
    return 0;
  }

  currentAnswerBubblesShown(): boolean {
    return this.renderedAnswersShown !== false;
  }

  answerBubblesAnimating(): boolean {
    for (const tile of this.playerWidgetTiles()) {
      const renderer = this.tileRenderers.get(tile);
      const lifecycleState = renderer?.componentLifecycleState?.(PLAYER_ANSWER_BUBBLE_MC_ID);
      if (lifecycleState === "appearing" || lifecycleState === "disappearing") return true;
    }
    return false;
  }

  hasParkedShownBubbles(): boolean {
    if (!this.currentAnswerBubblesShown() || !this.host) return false;
    return Array.from(this.host.querySelectorAll(".player-tile[data-answer-bubble-has-answer='true']")).some((node) => {
      const tile = node as El;
      return this.tileRenderers.get(tile)?.isComponentVisible?.(PLAYER_ANSWER_BUBBLE_MC_ID) !== true;
    });
  }

  resetAnswerBubbles(): void {
    this.renderedAnswersShown = false;
    for (const tile of this.playerWidgetTiles()) {
      const renderer = this.tileRenderers.get(tile);
      renderer?.stopAtComponent?.(PLAYER_ANSWER_BUBBLE_MC_ID, "Off", { instant: true });
      renderer?.stopAtComponent?.(PLAYER_ANSWER_BUBBLE_STATE_ID, "Default", { instant: true });
      tile.dataset.answerBubbleVisible = "false";
      tile.dataset.answerBubbleCorrectness = "";
    }
  }

  revealAnswerCorrectness(options: Dict = {}): number {
    if (!this.host) return 0;
    const answerCorrectness = (options.answerCorrectness as Dict) || null;
    const correctPlayerIds = new Set(((answerCorrectness?.correctPlayerIds as unknown[]) || []).map(String));
    const incorrectPlayerIds = new Set(((answerCorrectness?.incorrectPlayerIds as unknown[]) || []).map(String));
    let duration = 0;
    const barrier = typeof options.complete === "function" ? createActionCompletionBarrier() : null;
    for (const node of Array.from(this.host.querySelectorAll(".player-tile[data-player-id]"))) {
      const tile = node as El;
      const player = this.tilePlayers.get(tile);
      const renderer = this.tileRenderers.get(tile);
      if (!player || !renderer) continue;
      const state = playerAnswerBubbleRuntimeState(player, true);
      const playerId = String(player.id || tile.dataset.playerId || "");
      const actionStateLabel = correctPlayerIds.has(playerId)
        ? "Correct"
        : incorrectPlayerIds.has(playerId)
          ? "Incorrect"
          : "";
      const snapshotStateLabel = playerAnswerBubbleStateLabel(state);
      const stateLabel = actionStateLabel || (snapshotStateLabel === "Default" ? "" : snapshotStateLabel);
      // Reveal Player Answer Correctness owns only the two correctness states.
      // Missing classification data must never issue a competing Default command;
      // resetAnswerBubbles is the sole owner of returning the semantic child to Default.
      if (!stateLabel) continue;
      const targetComplete = barrier?.addTarget();
      const stopOptions: Dict = { instant: true };
      if (targetComplete) stopOptions.complete = targetComplete;
      const stateDuration = renderer.stopAtComponent?.(
        PLAYER_ANSWER_BUBBLE_STATE_ID,
        stateLabel,
        stopOptions
      ) || 0;
      tile.dataset.answerBubbleCorrectness = stateLabel === "Correct" ? "correct" : stateLabel === "Incorrect" ? "wrong" : "";
      duration = Math.max(duration, stateDuration);
    }
    if (barrier) {
      barrier.promise.then(options.complete as () => void);
      barrier.seal();
    }
    return duration;
  }

  setAnswerBubblesShown(isShown: boolean, options: Dict = {}): number {
    if (!this.host) return 0;
    const instant = options.instant === true;
    const complete = typeof options.complete === "function" ? (options.complete as () => void) : null;
    const playerFilter = String(options.playerFilter || "all").trim().toLowerCase() || "all";
    if (playerFilter === "all") this.renderedAnswersShown = isShown !== false;

    let duration = 0;
    let pendingCompletions = 0;
    let schedulingCompletions = true;
    let completionSent = false;
    const finishIfComplete = () => {
      if (!complete || completionSent || schedulingCompletions || pendingCompletions > 0) return;
      completionSent = true;
      complete();
    };
    const nextCompletion = () => {
      pendingCompletions += 1;
      let completed = false;
      return () => {
        if (completed) return;
        completed = true;
        pendingCompletions = Math.max(0, pendingCompletions - 1);
        finishIfComplete();
      };
    };
    for (const node of Array.from(this.host.querySelectorAll(".player-tile[data-player-id]"))) {
      const tile = node as El;
      const player = this.tilePlayers.get(tile);
      if (!player || !tileMatchesAnswerFilter(tile, player, playerFilter)) continue;
      const bubbleComplete = complete ? nextCompletion() : undefined;
      if (playerFilter === "all") {
        const renderer = this.tileRenderers.get(tile);
        if (!renderer) continue;
        const state = playerAnswerBubbleRuntimeState(player, isShown !== false);
        state.visible = state.hasAnswer && isShown !== false;
        const bubbleDuration = this.syncAnswerBubbleComponent(renderer, state, { instant, complete: bubbleComplete });
        duration = Math.max(duration, bubbleDuration);
        tile.dataset.answerBubbleVisible = state.visible ? "true" : "false";
        continue;
      }
      const renderer = this.tileRenderers.get(tile);
      if (!renderer) continue;
      const state = playerAnswerBubbleRuntimeState(player, true);
      state.visible = state.hasAnswer && isShown !== false;
      const bubbleDuration = this.syncAnswerBubbleComponent(renderer, state, {
          instant,
          previousVisible: tile.dataset.answerBubbleVisible === "true",
          previousNonce: tile.dataset.answerBubbleNonce || "",
          previousText: tile.dataset.answerBubbleText || "",
          previousCorrectness: tile.dataset.answerBubbleCorrectness || "",
          complete: bubbleComplete
        });
      duration = Math.max(duration, bubbleDuration);
      tile.dataset.answerBubbleHasAnswer = state.hasAnswer ? "true" : "false";
      tile.dataset.answerBubbleVisible = state.visible ? "true" : "false";
    }
    schedulingCompletions = false;
    finishIfComplete();
    return duration;
  }

  tileForPlayerId(playerId: unknown): El | null {
    if (!this.host || !playerId) return null;
    const expectedId = String(playerId);
    return (Array.from(this.host.querySelectorAll(".player-tile[data-player-id]")) as El[])
      .find((tile) => tile.dataset.playerId === expectedId) || null;
  }

  pointPopupLayer(): El | null {
    if (!this.host) return null;
    let layer = this.host.querySelector(":scope > .player-point-popup-layer") as El | null;
    if (layer) return layer;
    layer = this.document.createElement("div");
    layer.className = "player-point-popup-layer";
    this.host.appendChild(layer);
    return layer;
  }

  pointPopupAnchor(tile: El | null): PointLike | null {
    if (!tile) return null;
    const composition = this.playerObjectCompositionFor(this.tilePlayers.get(tile) || {});
    return playerWidgetPointPopupAnchorPosition(composition);
  }

  positionPointPopup(node: El | null, tile: El | null): boolean {
    if (!node || !tile || !this.host) return false;
    const playerObject = tile.querySelector(":scope > .player-object-art-host") as El | null;
    const composition = this.playerObjectCompositionFor(this.tilePlayers.get(tile) || {});
    const anchor = this.pointPopupAnchor(tile);
    if (!playerObject || !composition || !anchor) return false;
    const hostRect = this.host.getBoundingClientRect();
    const playerObjectRect = playerObject.getBoundingClientRect();
    const canvas = (composition.canvas as Dict) || { width: 300, height: 370 };
    const anchorViewportPosition = authoredCanvasPointViewportPosition(
      anchor,
      {
        width: Math.max(1, Number(canvas.width || 1)),
        height: Math.max(1, Number(canvas.height || 1)),
        minX: Number(canvas.minX || 0),
        minY: Number(canvas.minY || 0)
      },
      playerObjectRect
    );
    const position = pointPopupOverlayPosition(
      { left: anchorViewportPosition.x, top: anchorViewportPosition.y, width: 0, height: 0 },
      hostRect,
      {
        width: elementDimension(this.host, "width", hostRect.width || 1),
        height: elementDimension(this.host, "height", hostRect.height || 1)
      }
    );
    node.style.left = `${position.left}px`;
    node.style.top = `${position.top}px`;
    return true;
  }

  positionPointPopups(): void {
    if (!this.host || typeof this.host.querySelector !== "function") return;
    const layer = this.host.querySelector(":scope > .player-point-popup-layer");
    if (!layer) return;
    const popupNodes = Array.from(layer.querySelectorAll(".point-popup[data-player-id]"));
    for (const node of popupNodes) {
      const popupNode = node as El;
      this.positionPointPopup(popupNode, this.tileForPlayerId(popupNode.dataset.playerId));
    }
  }

  renderPointPopups(popups: Dict[] = [], options: Dict = {}): void {
    for (const popup of popups || []) {
      if (!popup?.id || this.pointPopupIds.has(popup.id as string)) continue;
      const tile = this.tileForPlayerId(popup.playerId);
      const anchor = this.pointPopupAnchor(tile);
      const layer = this.pointPopupLayer();
      if (!tile || !anchor || !layer) continue;
      const node = this.document.createElement("div");
      node.className = "point-popup point-popup-hidden";
      node.dataset.pointPopupId = popup.id as string;
      node.dataset.playerId = String(popup.playerId || "");
      if (!this.renderPointPopupPrefab(node, popup)) continue;
      this.pointPopupIds.add(popup.id as string);
      layer.appendChild(node);
      this.positionPointPopup(node, tile);
      node.dataset.pointPopupPending = "true";
    }
    void options;
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
    const composition = this.getComposition?.(POINT_POPUP_COMPOSITION_ID);
    const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer } | undefined;
    if (!node || !composition || !artRuntime?.ArtObjectTreeRenderer) return false;
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
      instant: true,
      timeline: pointPopupTimeline(composition)
    });
    return true;
  }

  playPointPopup(node: El, popup: Dict, options: Dict = {}): number {
    if (!node || !popup?.id) return 0;
    if (node.dataset) delete node.dataset.pointPopupPending;
    const renderer = this.pointPopupRenderers.get(node);
    if (!renderer?.playAll) return 0;
    node.classList.remove("point-popup-hidden");
    const finish = () => {
      this.disposePointPopup(node);
      if (typeof options.complete === "function") (options.complete as () => void)();
    };
    return renderer.playAll("Popup", { instant: false, complete: finish });
  }

  showPointPopupsForAction(): void {
    for (const node of Array.from(this.host?.querySelectorAll(".point-popup[data-point-popup-pending='true']") || [])) {
      const popupNode = node as El;
      this.playPointPopup(popupNode, { id: popupNode.dataset.pointPopupId });
    }
  }

  disposePointPopup(node: El): void {
    this.pointPopupRenderers.get(node)?.dispose?.();
    this.pointPopupRenderers.delete(node);
    node.remove();
  }

  clearPointPopupIds(): void {
    this.pointPopupIds.clear();
  }

  clearPointPopups(): void {
    this.clearPointPopupIds();
    this.host?.querySelectorAll(".point-popup").forEach((node) => this.disposePointPopup(node as El));
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
