// Timeline-driven voting-card renderer. Voting cards mirror the Player Widget MC
// architecture: a parent MC owns independently addressable child MCs, while the
// card-art child owns a deeper stopped correctness-state timeline.

import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import type { TimelineDocument } from "../../shared/timeline-model";

type Dict = Record<string, unknown>;
type El = HTMLElement;

interface VisualBridgeApi {
  createVisualForTarget?: (options: Dict) => Dict | undefined;
}

interface TreeRenderer {
  render: (components: Dict[], canvas: Dict, options: Dict) => void;
  clear: (options: Dict) => void;
  isComponentVisible?: (componentId: string) => boolean;
  playComponent?: (componentId: string, animation: string, options?: Dict) => number;
  stopAtComponent?: (componentId: string, animation: string, options?: Dict) => number;
}

interface VisualLike {
  play: (animation: string, options?: Dict) => number;
}

declare global {
  interface Window {
    PartyGameVotingCardVisuals?: typeof PartyGameVotingCardVisuals;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const visualBridge = (): VisualBridgeApi | undefined => w().PartyGameVisualBridge as unknown as VisualBridgeApi | undefined;

export const VOTING_CARD_MC_ID = "prefab-voting-card-mc";
export const VOTING_CARD_ART_MC_ID = "prefab-voting-card-art-mc";
export const VOTING_CARD_ANSWER_MC_ID = "prefab-voting-card-answer-mc";
export const VOTING_CARD_AUTHOR_MC_ID = "prefab-voting-card-author-mc";
export const VOTING_CARD_VOTE_COUNT_MC_ID = "prefab-voting-card-vote-count-mc";
export const VOTING_CARD_VOTERS_MC_ID = "prefab-voting-card-voters-mc";
export const VOTING_CARD_CORRECTNESS_STATE_ID = "prefab-voting-card-correctness-state";

export const VOTING_CARD_ART_COMPONENT_ID = "voting-card-art-mc";
export const VOTING_CARD_ANSWER_COMPONENT_ID = "voting-card-answer-mc";
export const VOTING_CARD_AUTHOR_COMPONENT_ID = "voting-card-author-mc";
export const VOTING_CARD_VOTE_COUNT_COMPONENT_ID = "voting-card-vote-count-mc";
export const VOTING_CARD_VOTERS_COMPONENT_ID = "voting-card-voters-mc";
export const VOTING_CARD_CORRECTNESS_COMPONENT_ID = "voting-card-correctness-state";
export const VOTING_CARD_VOTER_CONTAINER_ID = "voting-card-voter-container";
export const VOTING_CARD_VOTE_WIDGET_ID = "voting-card-vote-widget";

export function votingCardArtTimeline(timeline: unknown): TimelineDocument {
  return effectiveVisibilityTimeline(timeline as TimelineDocument | null | undefined);
}

function cloneComponent(component: Dict): Dict {
  return {
    ...component,
    children: Array.isArray(component.children) ? (component.children as Dict[]).map(cloneComponent) : []
  };
}

function cloneComposition(composition: Dict): Dict {
  return {
    ...composition,
    canvas: { ...((composition.canvas as Dict) || {}) },
    components: ((composition.components as Dict[]) || []).map(cloneComponent),
    timeline: composition.timeline ? structuredClone(composition.timeline) : composition.timeline
  };
}

function safeComponentId(value: unknown, fallback: string): string {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function componentById(composition: Dict | null, id: string): Dict | null {
  return ((composition?.components as Dict[]) || []).find((component) => component.id === id) || null;
}

function legacyVotingCardComponent(legacy: Dict | null, id: string, fallback: Dict): Dict {
  return cloneComponent(componentById(legacy, id) || fallback);
}

const fallbackLifecycle = (): TimelineDocument => votingCardArtTimeline(null);

function fallbackComposition(id: string, legacy: Dict | null): Dict | null {
  if (id === VOTING_CARD_MC_ID) {
    return {
      id,
      name: "Voting Card MC",
      canvas: { width: 560, height: 230 },
      components: [
        { id: VOTING_CARD_ART_COMPONENT_ID, instanceLabel: "cardArt", kind: "reference", artCompositionId: VOTING_CARD_ART_MC_ID, x: 280, y: 115, width: 560, height: 230, scale: 1 },
        { id: VOTING_CARD_ANSWER_COMPONENT_ID, instanceLabel: "answer", kind: "reference", artCompositionId: VOTING_CARD_ANSWER_MC_ID, x: 280, y: 86, width: 420, height: 78, scale: 1 },
        { id: VOTING_CARD_AUTHOR_COMPONENT_ID, instanceLabel: "author", kind: "reference", artCompositionId: VOTING_CARD_AUTHOR_MC_ID, x: 280, y: 32, width: 340, height: 28, scale: 1 },
        { id: VOTING_CARD_VOTERS_COMPONENT_ID, instanceLabel: "voters", kind: "reference", artCompositionId: VOTING_CARD_VOTERS_MC_ID, x: 278, y: 188, width: 500, height: 48, scale: 1 },
        { id: VOTING_CARD_VOTE_COUNT_COMPONENT_ID, instanceLabel: "voteCount", kind: "reference", artCompositionId: VOTING_CARD_VOTE_COUNT_MC_ID, x: 30.927, y: 28, width: 48, height: 48, scale: 1 }
      ],
      timeline: fallbackLifecycle()
    };
  }
  if (id === VOTING_CARD_ART_MC_ID) {
    const surface = legacyVotingCardComponent(legacy, "current-card", { id: "voting-card-surface", kind: "shape", x: 280, y: 86, width: 520, height: 150, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 5, borderRadius: 16 });
    surface.id = "voting-card-surface";
    surface.instanceLabel = "cardSurface";
    return {
      id,
      name: "Voting Card Art MC",
      canvas: { width: 560, height: 230 },
      components: [
        surface,
        { id: VOTING_CARD_CORRECTNESS_COMPONENT_ID, instanceLabel: "correctnessState", kind: "reference", artCompositionId: VOTING_CARD_CORRECTNESS_STATE_ID, x: 280, y: 86, width: 520, height: 150, scale: 1 }
      ],
      timeline: fallbackLifecycle()
    };
  }
  if (id === VOTING_CARD_ANSWER_MC_ID) {
    const text = legacyVotingCardComponent(legacy, "answer-text", { id: "voting-card-answer-text", kind: "text", x: 210, y: 39, width: 420, height: 78, defaultText: "ANSWER", fontSize: 32, fontColor: "#17131f" });
    text.id = "voting-card-answer-text";
    text.instanceLabel = "answerText";
    text.x = 210;
    text.y = 39;
    return { id, name: "Voting Card Answer MC", canvas: { width: 420, height: 78 }, components: [text], timeline: fallbackLifecycle() };
  }
  if (id === VOTING_CARD_AUTHOR_MC_ID) {
    const text = legacyVotingCardComponent(legacy, "author-heading", { id: "voting-card-author-text", kind: "text", x: 170, y: 14, width: 340, height: 28, defaultText: "AUTHOR", fontSize: 15, fontColor: "#6b5a80" });
    text.id = "voting-card-author-text";
    text.instanceLabel = "authorText";
    text.x = 170;
    text.y = 14;
    return { id, name: "Voting Card Author MC", canvas: { width: 340, height: 28 }, components: [text], timeline: fallbackLifecycle() };
  }
  if (id === VOTING_CARD_VOTE_COUNT_MC_ID) {
    const badge = legacyVotingCardComponent(legacy, "vote-count", { id: "voting-card-vote-count", kind: "badge", x: 24, y: 24, width: 48, height: 48, defaultText: "", fontSize: 10, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 2, borderRadius: 999 });
    badge.id = "voting-card-vote-count";
    badge.instanceLabel = "voteCountText";
    badge.x = 24;
    badge.y = 24;
    return { id, name: "Voting Card Vote Count MC", canvas: { width: 48, height: 48 }, components: [badge], timeline: fallbackLifecycle() };
  }
  if (id === VOTING_CARD_VOTERS_MC_ID) {
    const container = legacyVotingCardComponent(legacy, "voter-container", { id: VOTING_CARD_VOTER_CONTAINER_ID, kind: "container", x: 250, y: 24, width: 500, height: 48, childDistribution: "horizontal", fillColor: "transparent", borderColor: "transparent" });
    const widget = legacyVotingCardComponent(legacy, "vote-widget", { id: VOTING_CARD_VOTE_WIDGET_ID, kind: "badge", x: 250, y: 24, width: 112, height: 32, defaultText: "PLAYER", fontSize: 15, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 2, borderRadius: 999 });
    container.id = VOTING_CARD_VOTER_CONTAINER_ID;
    container.instanceLabel = "voterContainer";
    container.x = 250;
    container.y = 24;
    widget.id = VOTING_CARD_VOTE_WIDGET_ID;
    widget.instanceLabel = "voteWidget";
    widget.x = 250;
    widget.y = 24;
    container.children = [widget];
    return { id, name: "Voting Card Voters MC", canvas: { width: 500, height: 48 }, components: [container], timeline: fallbackLifecycle() };
  }
  if (id === VOTING_CARD_CORRECTNESS_STATE_ID) {
    return {
      id,
      name: "Voting Card Correctness State",
      canvas: { width: 520, height: 150 },
      components: [{ id: "voting-card-correct-surface", instanceLabel: "correctSurface", kind: "shape", x: 260, y: 75, width: 520, height: 150, fillColor: "#60d394", borderColor: "#17131f", borderWidth: 5, borderRadius: 16 }],
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [{ name: "Neutral", frame: 0 }, { name: "Correct", frame: 1 }],
        commands: [{ id: "stop-0", frame: 0, type: "stop" }, { id: "visible-0", frame: 0, type: "setVisible", target: "false" }, { id: "stop-1", frame: 1, type: "stop" }, { id: "visible-1", frame: 1, type: "setVisible", target: "true" }],
        commandFrames: [0, 1],
        tracks: []
      }
    };
  }
  return null;
}

export interface VotingCardRuntimeState {
  answerText: string;
  authorText: string;
  voteCount: number;
  voters: Dict[];
}

export function runtimeVotingCardComposition(composition: Dict, compositionId: string, state: VotingCardRuntimeState): Dict {
  const runtime = cloneComposition(composition);
  const components = (runtime.components as Dict[]) || [];
  if (compositionId === VOTING_CARD_ANSWER_MC_ID) {
    const text = components.find((component) => component.id === "voting-card-answer-text");
    if (text) text.defaultText = state.answerText;
  } else if (compositionId === VOTING_CARD_AUTHOR_MC_ID) {
    const text = components.find((component) => component.id === "voting-card-author-text");
    if (text) text.defaultText = state.authorText;
  } else if (compositionId === VOTING_CARD_VOTE_COUNT_MC_ID) {
    const text = components.find((component) => component.id === "voting-card-vote-count");
    if (text) text.defaultText = state.voteCount > 0 ? String(state.voteCount) : "";
  } else if (compositionId === VOTING_CARD_VOTERS_MC_ID) {
    const container = components.find((component) => component.id === VOTING_CARD_VOTER_CONTAINER_ID);
    const template = ((container?.children as Dict[]) || []).find((component) => component.id === VOTING_CARD_VOTE_WIDGET_ID);
    if (container && template) {
      container.children = state.voters.map((voter, index) => ({
        ...cloneComponent(template),
        id: `${VOTING_CARD_VOTE_WIDGET_ID}-${safeComponentId(voter.id, `voter-${index}`)}`,
        instanceLabel: `vote${index + 1}`,
        name: voter.name ? `Vote ${voter.name}` : `Vote ${index + 1}`,
        defaultText: String(voter.name || "Player")
      }));
    }
  }
  return runtime;
}

function createVotingCardElement(documentRef: Document, cardId: string): El {
  const group = documentRef.createElement("article");
  group.className = "voting-card-group voting-card-group-hidden";
  group.dataset.cardId = cardId;
  const artHost = documentRef.createElement("div");
  artHost.className = "voting-card-art-objects";
  group.appendChild(artHost);
  return group;
}

class VotingCardView {
  document: Document;
  visualAnimation: unknown;
  gameObjectApi: unknown;
  getComposition: (id: string) => Dict | null;
  cardId: string;
  element: El;
  artHost: El;
  rootRenderer: TreeRenderer | null;
  groupVisual: VisualLike;
  cardData: Dict = {};
  currentVisibleVoters: Dict[] = [];
  voteRevealKey = "";
  voteRevealTimers: number[] = [];

  constructor(options: Dict) {
    this.document = options.document as Document;
    this.visualAnimation = options.visualAnimation;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.getComposition = options.getComposition as (id: string) => Dict | null;
    this.cardId = String(options.cardId || "card");
    this.element = createVotingCardElement(this.document, this.cardId);
    this.artHost = this.element.querySelector(".voting-card-art-objects") as El;
    this.rootRenderer = this.createRenderer();
    const parent = this.composition(VOTING_CARD_MC_ID);
    const bridge = visualBridge()?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: this.element,
      gameObjectOptions: {
        id: `voting-card:${this.cardId}`,
        visibilityKey: `voting-card:${this.cardId}`,
        isArt: true,
        isDynamic: true,
        visualOptions: {
          hiddenClasses: ["voting-card-group-hidden"],
          motionHiddenClasses: ["voting-card-group-hidden"],
          exitingClass: "voting-card-group-exiting",
          instantClass: "voting-card-instant",
          layoutHiddenClasses: ["voting-card-group-hidden", "voting-card-group-exiting"],
          timeline: votingCardArtTimeline(parent?.timeline),
          timelineApplySelf: true,
          timelineCanvas: (parent?.canvas as Dict) || { width: 560, height: 230 }
        }
      }
    });
    this.groupVisual = ((bridge?.visual as VisualLike) || (bridge?.legacyVisual as VisualLike))!;
  }

  composition(id: string): Dict | null {
    const authored = this.getComposition?.(id) || null;
    if (authored) return authored;
    const legacy = this.getComposition?.("voting-card") || null;
    return fallbackComposition(id, legacy);
  }

  runtimeState(): VotingCardRuntimeState {
    return {
      answerText: String(this.cardData.text || ""),
      authorText: String(this.cardData.authorName || ""),
      voteCount: this.currentVisibleVoters.length,
      voters: this.currentVisibleVoters
    };
  }

  runtimeComposition(id: string): Dict | null {
    const composition = this.composition(id);
    return composition ? runtimeVotingCardComposition(composition, id, this.runtimeState()) : null;
  }

  createRenderer(): TreeRenderer | null {
    const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (options: Dict) => TreeRenderer } | undefined;
    if (!artRuntime?.ArtObjectTreeRenderer) return null;
    return new artRuntime.ArtObjectTreeRenderer({
      host: this.artHost,
      document: this.document,
      instanceId: `voting-card:${this.cardId}:mc`,
      gameObjectApi: this.gameObjectApi,
      visualAnimation: w().PartyGameVisualObject,
      getComposition: (id: string) => this.runtimeComposition(id)
    });
  }

  renderArt(): void {
    const parent = this.runtimeComposition(VOTING_CARD_MC_ID);
    if (!parent || !this.rootRenderer) return;
    const canvas = (parent.canvas as Dict) || { width: 560, height: 230 };
    this.element.style.width = `${Number(canvas.width || 560)}px`;
    this.element.style.height = `${Number(canvas.height || 230)}px`;
    this.rootRenderer.render((parent.components as Dict[]) || [], canvas, { instant: true });
  }

  playChild(componentId: string, animation: string, options: Dict = {}): number {
    return this.rootRenderer?.playComponent?.(componentId, animation, options) || 0;
  }

  sync(cardData: Dict, options: Dict = {}): void {
    const firstRender = this.element.dataset.votingCardInitialized !== "true";
    const previousAuthorsRevealed = this.element.dataset.authorsRevealed === "true";
    const previousWinner = this.element.dataset.winnerRevealed === "true";
    this.cardData = cardData;
    if (cardData.votesRevealed !== true) this.currentVisibleVoters = [];
    this.renderArt();

    if (firstRender) {
      this.groupVisual.play(options.instant === true ? "On" : "Appear", { instant: options.instant === true });
      this.playChild(VOTING_CARD_ART_COMPONENT_ID, options.instant === true ? "On" : "Appear", { instant: options.instant === true });
      this.playChild(VOTING_CARD_ANSWER_COMPONENT_ID, options.instant === true ? "On" : "Appear", { instant: options.instant === true });
      this.playChild(VOTING_CARD_AUTHOR_COMPONENT_ID, "Off", { instant: true });
      this.playChild(VOTING_CARD_VOTERS_COMPONENT_ID, "Off", { instant: true });
      this.playChild(VOTING_CARD_VOTE_COUNT_COMPONENT_ID, "Off", { instant: true });
      this.element.dataset.votingCardInitialized = "true";
    }

    if (cardData.authorsRevealed === true && !previousAuthorsRevealed) {
      this.playChild(VOTING_CARD_AUTHOR_COMPONENT_ID, options.instant === true ? "On" : "Appear", { instant: options.instant === true });
    } else if (cardData.authorsRevealed !== true) {
      this.playChild(VOTING_CARD_AUTHOR_COMPONENT_ID, "Off", { instant: true });
    }

    const correctnessLabel = cardData.isWinner === true ? "Correct" : "Neutral";
    if (!previousWinner || cardData.isWinner !== true) {
      this.rootRenderer?.stopAtComponent?.(VOTING_CARD_CORRECTNESS_COMPONENT_ID, correctnessLabel, { instant: true });
    }

    this.syncVoters(cardData, options);
    this.element.dataset.authorsRevealed = cardData.authorsRevealed === true ? "true" : "false";
    this.element.dataset.winnerRevealed = cardData.isWinner === true ? "true" : "false";
  }

  clearVoteRevealTimers(): void {
    for (const timerId of this.voteRevealTimers) clearTimeout(timerId);
    this.voteRevealTimers = [];
  }

  syncVoters(cardData: Dict, options: Dict = {}): void {
    if (cardData.votesRevealed !== true) {
      this.clearVoteRevealTimers();
      this.voteRevealKey = "";
      this.currentVisibleVoters = [];
      this.renderArt();
      this.playChild(VOTING_CARD_VOTERS_COMPONENT_ID, "Off", { instant: true });
      this.playChild(VOTING_CARD_VOTE_COUNT_COMPONENT_ID, "Off", { instant: true });
      return;
    }
    const voters = (cardData.voters as Dict[]) || [];
    const revealKey = `${String(options.voteRevealKey || "instant")}:${voters.map((voter) => voter.id).join("|")}`;
    if (revealKey === this.voteRevealKey) return;
    this.clearVoteRevealTimers();
    this.voteRevealKey = revealKey;
    this.currentVisibleVoters = [];
    this.renderArt();
    this.playChild(VOTING_CARD_VOTERS_COMPONENT_ID, options.instant === true ? "On" : "Appear", { instant: options.instant === true });
    voters.forEach((voter, index) => {
      const delay = Math.max(0, Number(options.voteRevealStaggerMs || 0)) * (index + 1);
      const reveal = () => {
        if (this.voteRevealKey !== revealKey) return;
        const wasEmpty = this.currentVisibleVoters.length === 0;
        this.currentVisibleVoters = voters.slice(0, index + 1);
        this.renderArt();
        const voterId = `${VOTING_CARD_VOTE_WIDGET_ID}-${safeComponentId(voter.id, `voter-${index}`)}`;
        this.playChild(voterId, options.instant === true ? "On" : "Appear", { instant: options.instant === true });
        this.playChild(VOTING_CARD_VOTE_COUNT_COMPONENT_ID, wasEmpty ? (options.instant === true ? "On" : "Appear") : "Update", { instant: options.instant === true });
      };
      if (delay > 0) this.voteRevealTimers.push(setTimeout(reveal, delay) as unknown as number);
      else reveal();
    });
  }

  remove(options: Dict = {}): number {
    this.clearVoteRevealTimers();
    const instant = options.instant === true;
    let duration = 0;
    for (const componentId of [VOTING_CARD_AUTHOR_COMPONENT_ID, VOTING_CARD_VOTERS_COMPONENT_ID, VOTING_CARD_VOTE_COUNT_COMPONENT_ID, VOTING_CARD_ANSWER_COMPONENT_ID, VOTING_CARD_ART_COMPONENT_ID]) {
      duration = Math.max(duration, this.playChild(componentId, instant ? "Off" : "Disappear", { instant }));
    }
    duration = Math.max(duration, this.groupVisual.play(instant ? "Off" : "Disappear", { instant }));
    const element = this.element;
    const removeElement = () => {
      this.rootRenderer?.clear({ instant: true });
      element.remove();
    };
    if (duration > 0) setTimeout(removeElement, duration);
    else removeElement();
    return duration;
  }
}

class VotingCardRenderer {
  layer?: El;
  document: Document;
  visualAnimation: unknown;
  getComposition: (id: string) => Dict | null;
  gameObjectApi: unknown;
  cards = new Map<string, VotingCardView>();
  hideLayerTimer: number | null = null;

  constructor(options: Dict) {
    this.layer = options.layer as El | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.visualAnimation = options.visualAnimation;
    this.getComposition = options.getComposition as (id: string) => Dict | null;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
  }

  render(cards: Dict[] = [], options: Dict = {}): void {
    if (!this.layer) return;
    const list = Array.isArray(cards) ? cards : [];
    if (list.length) this.showLayer();
    const desiredIds = new Set(list.map((card) => String(card.id || "")));
    for (const cardData of list) {
      const cardId = String(cardData.id || "");
      let view = this.cards.get(cardId);
      if (!view) {
        view = new VotingCardView({
          document: this.document,
          visualAnimation: this.visualAnimation,
          getComposition: this.getComposition,
          gameObjectApi: this.gameObjectApi,
          cardId
        });
        this.cards.set(cardId, view);
        this.layer.appendChild(view.element);
      }
      view.sync(cardData, options);
    }
    let removalDuration = 0;
    for (const [cardId, view] of Array.from(this.cards.entries())) {
      if (desiredIds.has(cardId)) continue;
      this.cards.delete(cardId);
      removalDuration = Math.max(removalDuration, view.remove({ instant: options.instant === true }));
    }
    if (!list.length && !this.cards.size) this.scheduleLayerHide(removalDuration);
  }

  clear(options: Dict = {}): void {
    let removalDuration = 0;
    for (const view of this.cards.values()) removalDuration = Math.max(removalDuration, view.remove({ instant: options.instant !== false }));
    this.cards.clear();
    this.scheduleLayerHide(removalDuration);
  }

  showLayer(): void {
    if (this.hideLayerTimer !== null) clearTimeout(this.hideLayerTimer);
    this.hideLayerTimer = null;
    this.layer?.classList.remove("hidden");
  }

  scheduleLayerHide(delay = 0): void {
    if (this.hideLayerTimer !== null) clearTimeout(this.hideLayerTimer);
    if (!this.layer) return;
    if (delay > 0) {
      this.hideLayerTimer = setTimeout(() => {
        if (!this.cards.size) this.layer?.classList.add("hidden");
      }, delay) as unknown as number;
      return;
    }
    this.layer.classList.add("hidden");
  }
}

export const PartyGameVotingCardVisuals = {
  createRenderer: (options: Dict) => new VotingCardRenderer(options)
};

export function installStageVotingCardVisualsGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameVotingCardVisuals = PartyGameVotingCardVisuals;
}

installStageVotingCardVisualsGlobals(typeof window !== "undefined" ? window : globalThis);
