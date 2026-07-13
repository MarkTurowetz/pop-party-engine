// Typed port of the legacy client/stage/voting-card-visuals.js IIFE — the stage
// voting card renderer. Installs window.PartyGameVotingCardVisuals for the legacy
// stage runtime. PartyGame* deps are read lazily via globalThis at call time. The
// legacy used arguments.length to distinguish "text override passed" from "use
// default"; we replicate that with a NO_OVERRIDE sentinel.

import { normalizeGameTextFontFamily } from "../textFonts";
import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import type { TimelineDocument } from "../../shared/timeline-model";

type Dict = Record<string, unknown>;
type El = HTMLElement;

interface VisualBridgeApi {
  createVisualForTarget?: (options: Dict) => Dict | undefined;
}
interface TreeRenderer {
  host?: unknown;
  render: (components: Dict[], canvas: Dict, options: Dict) => void;
  clear: (options: Dict) => void;
  playAll?: (animation: string, options?: Dict) => number;
  playComponent?: (componentId: string, animation: string, options?: Dict) => number;
}
interface VisualLike {
  play: (animation: string, options?: Dict) => number;
  isVisible?: () => boolean;
}

declare global {
  interface Window {
    PartyGameVotingCardVisuals?: typeof PartyGameVotingCardVisuals;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const visualBridge = (): VisualBridgeApi | undefined => w().PartyGameVisualBridge as unknown as VisualBridgeApi | undefined;
const NO_OVERRIDE = Symbol("no-override");

export function votingCardArtTimeline(timeline: unknown): TimelineDocument {
  return effectiveVisibilityTimeline(timeline as TimelineDocument | null | undefined);
}

const KNOWN_COMPONENT_IDS = new Set(["current-card", "answer-text", "author-heading", "voter-container", "vote-count", "vote-widget"]);
const FALLBACK_VOTING_CARD_COMPOSITION: Dict = {
  canvas: { width: 560, height: 230 },
  components: [
    { id: "current-card", x: 280, y: 96, width: 520, height: 118, scale: 1, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 5, borderRadius: 16 },
    { id: "answer-text", x: 280, y: 96, width: 420, height: 78, scale: 1, fontSize: 32, fontColor: "#17131f" },
    { id: "author-heading", x: 280, y: 22, width: 340, height: 28, scale: 1, fontSize: 15, fontColor: "#6b5a80" },
    { id: "voter-container", x: 278, y: 188, width: 500, height: 48, scale: 1, childDistribution: "horizontal", fillColor: "transparent", borderColor: "transparent", borderWidth: 0, borderRadius: 0 },
    { id: "vote-count", x: 72, y: 188, width: 112, height: 32, scale: 1, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 2, borderRadius: 999, fontSize: 15, fontColor: "#17131f" },
    { id: "vote-widget", x: 280, y: 188, width: 112, height: 32, scale: 1, fillColor: "#fff8d6", borderColor: "#17131f", borderWidth: 2, borderRadius: 999, fontSize: 15, fontColor: "#17131f" }
  ]
};

function createVotingCardElement(documentRef: Document, cardId: string): El {
  const group = documentRef.createElement("article");
  group.className = "voting-card-group voting-card-group-hidden";
  group.dataset.cardId = cardId;
  group.innerHTML = `
      <div class="voting-card"></div>
      <div class="voting-card-answer"></div>
      <div class="voting-card-votes voting-card-widget-hidden"></div>
      <div class="voting-card-author voting-card-widget-hidden"></div>
      <div class="voting-card-voters voting-card-widget-hidden"></div>
      <div class="voting-card-art-objects"></div>
    `;
  return group;
}

function cloneComponentTree(component: Dict): Dict {
  return {
    ...(component || {}),
    children: Array.isArray(component?.children) ? (component.children as Dict[]).map(cloneComponentTree) : []
  };
}

function safeComponentId(value: unknown, fallback: string): string {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

class VotingCardView {
  document: Document;
  visualAnimation: unknown;
  avatarClass: unknown;
  avatarFrameImage: () => string;
  dinoIcon: (shape?: string) => string;
  playerAvatarArt: (shape?: string) => string;
  getComposition: unknown;
  gameObjectApi: unknown;
  cardId: string;
  visualGameObjects = new WeakMap<El, Dict>();
  visualFallbacks = new WeakMap<El, Dict>();
  element: El;
  authorElement: El;
  cardElement: El;
  answerElement: El;
  voteBadgeElement: El;
  votersElement: El;
  artObjectsElement: El;
  artObjectRuntime: { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer } | null;
  rootArtRenderer: TreeRenderer | null;
  componentChildRenderers = new Map<string, TreeRenderer>();
  voterArtRenderer: TreeRenderer | null = null;
  currentVisibleVoters: Dict[] = [];
  voteRevealKey = "";
  voteRevealBadgeCount = 0;
  voteRevealTimers: number[] = [];
  visibleVoteCount = 0;
  groupVisual: VisualLike;
  authorVisual: VisualLike;
  votersVisual: VisualLike;
  voteCountVisual: VisualLike | null;
  answerText = "";
  authorText = "";
  voteCountText?: string;

  constructor(options: Dict) {
    this.document = options.document as Document;
    this.visualAnimation = options.visualAnimation;
    this.avatarClass = options.avatarClass;
    this.avatarFrameImage = (options.avatarFrameImage as () => string) || (() => "");
    this.dinoIcon = (options.dinoIcon as (s?: string) => string) || (() => "");
    this.playerAvatarArt = (options.playerAvatarArt as (s?: string) => string) || ((shape?: string) => `${this.avatarFrameImage()}${this.dinoIcon(shape)}`);
    this.getComposition = options.getComposition;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.cardId = options.cardId as string;
    this.element = createVotingCardElement(this.document, options.cardId as string);
    this.authorElement = this.element.querySelector(".voting-card-author") as El;
    this.cardElement = this.element.querySelector(".voting-card") as El;
    this.answerElement = this.element.querySelector(".voting-card-answer") as El;
    this.voteBadgeElement = this.element.querySelector(".voting-card-votes") as El;
    this.votersElement = this.element.querySelector(".voting-card-voters") as El;
    this.artObjectsElement = this.element.querySelector(".voting-card-art-objects") as El;
    this.artObjectRuntime = (w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer }) || null;
    this.rootArtRenderer = this.createArtTreeRenderer(this.artObjectsElement);
    this.groupVisual = this.createVisual(
      this.element,
      { hiddenClasses: ["voting-card-group-hidden"], motionHiddenClasses: ["voting-card-group-hidden"], exitingClass: "voting-card-group-exiting", updateClass: "voting-card-update", instantClass: "voting-card-instant" },
      "group"
    ) as VisualLike;
    this.authorVisual = this.createVisual(
      this.authorElement,
      { hiddenClasses: ["voting-card-widget-hidden"], motionHiddenClasses: ["voting-card-widget-hidden"], instantClass: "voting-card-widget-instant" },
      "author"
    ) as VisualLike;
    this.votersVisual = this.createVisual(
      this.votersElement,
      { hiddenClasses: ["voting-card-widget-hidden"], motionHiddenClasses: ["voting-card-widget-hidden"], instantClass: "voting-card-widget-instant" },
      "voters"
    ) as VisualLike;
    this.voteCountVisual = this.createVisual(
      this.voteBadgeElement,
      { hiddenClasses: ["voting-card-widget-hidden"], motionHiddenClasses: ["voting-card-widget-hidden"], instantClass: "voting-card-widget-instant", updateClass: "voting-card-update" },
      "vote-count"
    );
  }

  createVisual(element: El | null, options: Dict = {}, key = ""): VisualLike | null {
    if (!element) return null;
    const id = `voting-card:${this.cardId || this.element?.dataset.cardId || "card"}:${key || element.dataset.voterId || element.className || "visual"}`;
    const hidden = Array.isArray(options.hiddenClasses) ? (options.hiddenClasses as unknown[]) : [options.hiddenClasses];
    const bridge = visualBridge()?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: element,
      gameObject: this.visualGameObjects.get(element),
      legacyVisual: this.visualFallbacks.get(element),
      gameObjectOptions: {
        id,
        visibilityKey: id,
        isArt: true,
        isDynamic: true,
        visualOptions: {
          ...options,
          layoutHiddenClasses: [...hidden.filter(Boolean), ...(options.exitingClass ? [options.exitingClass] : [])]
        }
      },
      legacyVisualOptions: options
    });
    if (bridge?.gameObject) this.visualGameObjects.set(element, bridge.gameObject as Dict);
    if (bridge?.legacyVisual) this.visualFallbacks.set(element, bridge.legacyVisual as Dict);
    return (bridge?.visual as VisualLike) || null;
  }

  createArtTreeRenderer(host: El | null): TreeRenderer | null {
    if (!this.artObjectRuntime || !host || !this.artObjectRuntime.ArtObjectTreeRenderer) return null;
    const hostKey = host.dataset?.artChildHostFor || host.className || "root";
    return new this.artObjectRuntime.ArtObjectTreeRenderer({
      host,
      document: this.document,
      instanceId: `voting-card:${this.cardId}:${hostKey}`,
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation
    });
  }

  sync(cardData: Dict, options: Dict = {}): void {
    this.element.dataset.cardIndex = String(cardData.index ?? "");
    this.answerText = (cardData.text as string) || "";
    this.cardElement.classList.toggle("is-winner", cardData.isWinner === true);
    this.cardElement.classList.toggle("is-loser", cardData.isLoser === true);
    this.syncAuthor(cardData);
    this.applyComposition();
    this.syncVoters(cardData, options);
    this.groupVisual.play("on");
  }

  composition(): Dict {
    return ((typeof this.getComposition === "function" ? (this.getComposition as () => Dict | null)() : null) as Dict) || FALLBACK_VOTING_CARD_COMPOSITION;
  }

  component(componentId: string, fallbackId = ""): Dict | null {
    const components = (this.composition()?.components as Dict[]) || [];
    return components.find((item) => item.id === componentId) || (fallbackId ? components.find((item) => item.id === fallbackId) : null) || null;
  }

  rootArtComponents(): Dict[] {
    return ((this.composition()?.components as Dict[]) || []).filter((component) => !KNOWN_COMPONENT_IDS.has(component.id as string));
  }

  applyComponentLayout(element: El | null, component: Dict | null, canvas: Dict | undefined, textOverride: unknown = NO_OVERRIDE): void {
    if (!element || !component) return;
    const canvasWidth = Math.max(1, Number(canvas?.width || 1));
    const canvasHeight = Math.max(1, Number(canvas?.height || 1));
    element.style.left = `${(Number(component.x || 0) / canvasWidth) * 100}%`;
    element.style.top = `${(Number(component.y || 0) / canvasHeight) * 100}%`;
    element.style.width = `${(Number(component.width || 1) / canvasWidth) * 100}%`;
    element.style.height = `${(Number(component.height || 1) / canvasHeight) * 100}%`;
    element.style.setProperty("--component-scale", String(Number(component.scale || 1)));
    element.style.setProperty("--component-rotation", `${Number(component.rotation || 0)}deg`);
    const labelText = textOverride !== NO_OVERRIDE ? String(textOverride ?? "") : String(component.defaultText || component.name || "");
    const fontSize = (w().PartyGameArtObject as { componentFontSize?: (c: Dict, t: string) => number } | undefined)?.componentFontSize?.(component, labelText) || Number(component.fontSize || 16);
    element.style.setProperty("--component-font-size", `${fontSize}px`);
    element.style.setProperty("--component-font-family", normalizeGameTextFontFamily(component.fontFamily));
    element.style.setProperty("--component-text-color", (component.fontColor as string) || "#17131f");
    element.style.setProperty("--component-fill-color", (component.fillColor as string) || "transparent");
    element.style.setProperty("--component-border-color", (component.borderColor as string) || "transparent");
    element.style.setProperty("--component-border-width", `${Number(component.borderWidth || 0)}px`);
    element.style.setProperty("--component-border-radius", `${Number(component.borderRadius || 0)}px`);
  }

  applyComposition(): void {
    const composition = this.composition();
    if (!composition) return;
    const canvas = (composition.canvas as Dict) || { width: 560, height: 230 };
    this.element.style.width = `${Number(canvas.width || 560)}px`;
    this.element.style.height = `${Number(canvas.height || 230)}px`;
    this.applyComponentLayout(this.cardElement, this.component("current-card"), canvas);
    this.applyComponentLayout(this.answerElement, this.component("answer-text"), canvas, this.answerText);
    this.renderComponentText(this.answerElement, this.component("answer-text"), this.answerText);
    this.applyComponentLayout(this.authorElement, this.component("author-heading"), canvas, this.authorText);
    this.renderComponentText(this.authorElement, this.component("author-heading"), this.authorText);
    this.applyComponentLayout(this.votersElement, this.component("voter-container"), canvas);
    this.applyComponentLayout(this.voteBadgeElement, this.component("vote-count", "vote-widget"), canvas, this.voteCountText);
    this.renderComponentText(this.voteBadgeElement, this.component("vote-count", "vote-widget"), this.voteCountText);
    this.renderRootArtObjects(canvas);
    this.renderComponentChildren("current-card", this.cardElement);
    this.renderComponentChildren("answer-text", this.answerElement);
    this.renderComponentChildren("author-heading", this.authorElement);
    this.renderComponentChildren("vote-count", this.voteBadgeElement);
    this.renderVoterArt(this.currentVisibleVoters, { instant: true, syncCount: false });
  }

  ensureChildHost(parentElement: El | null, componentId: string): El | null {
    if (!parentElement || !componentId) return null;
    let host = parentElement.querySelector(`:scope > .voting-card-component-children[data-component-id="${componentId}"]`) as El | null;
    if (!host) {
      host = this.document.createElement("div");
      host.className = "voting-card-component-children";
      host.dataset.componentId = componentId;
      parentElement.appendChild(host);
    }
    return host;
  }

  ensureVoterArtHost(): El {
    let host = this.votersElement.querySelector(":scope > .voting-card-voter-art-host") as El | null;
    if (!host) {
      host = this.document.createElement("div");
      host.className = "voting-card-voter-art-host";
      this.votersElement.appendChild(host);
    }
    return host;
  }

  renderRootArtObjects(canvas: Dict): void {
    this.rootArtRenderer?.render(this.rootArtComponents(), canvas, {
      timeline: votingCardArtTimeline(this.composition()?.timeline)
    });
    this.rootArtRenderer?.playAll?.("On", { instant: true });
  }

  renderComponentChildren(componentId: string, parentElement: El): void {
    const component = this.component(componentId);
    if (!(component?.children as Dict[])?.length) {
      const renderer = this.componentChildRenderers.get(componentId);
      if (renderer) renderer.clear({ instant: true });
      return;
    }
    const host = this.ensureChildHost(parentElement, componentId);
    if (!host) return;
    let renderer = this.componentChildRenderers.get(componentId);
    if (!renderer || renderer.host !== host) {
      const created = this.createArtTreeRenderer(host);
      if (!created) return;
      renderer = created;
      this.componentChildRenderers.set(componentId, renderer);
    }
    renderer.render((component!.children as Dict[]) || [], { width: Number(component!.width || 1), height: Number(component!.height || 1) }, {
      timeline: votingCardArtTimeline(component!.timeline)
    });
    renderer.playAll?.("On", { instant: true });
  }

  syncAuthor(cardData: Dict): void {
    this.authorText = (cardData.authorName as string) || "";
    if (cardData.authorsRevealed === true) {
      this.authorVisual.play("appear");
    } else {
      this.authorVisual.play("off", { instant: true });
    }
  }

  clearVoteRevealTimers(): void {
    for (const timerId of this.voteRevealTimers) clearTimeout(timerId);
    this.voteRevealTimers = [];
  }

  syncVoteCount(visibleVoteCount: unknown): void {
    const count = Math.max(0, Math.floor(Number(visibleVoteCount || 0)));
    const wasVisible = this.voteCountVisual?.isVisible?.() === true;
    this.visibleVoteCount = count;
    this.voteCountText = count > 0 ? String(count) : "";
    this.renderComponentText(this.voteBadgeElement, this.component("vote-count", "vote-widget"), this.voteCountText);
    this.renderComponentChildren("vote-count", this.voteBadgeElement);
    if (count > 0) {
      this.voteCountVisual?.play(wasVisible ? "update" : "appear");
    } else {
      this.voteCountVisual?.play("off", { instant: true });
    }
  }

  voterArtRoot(voters: Dict[] = []): Dict | null {
    const container = this.component("voter-container");
    const widget = this.component("vote-widget");
    if (!container || !widget) return null;
    const width = Math.max(1, Number(container.width || 1));
    const height = Math.max(1, Number(container.height || 1));
    const children = voters.map((voter, index) => {
      const voterId = safeComponentId(voter?.id, `voter-${index}`);
      const clone = cloneComponentTree(widget);
      clone.id = `vote-widget-${voterId}`;
      clone.name = voter?.name ? `Vote Widget ${voter.name}` : `Vote Widget ${index + 1}`;
      clone.defaultText = voter?.name || "Player";
      clone.x = width / 2;
      clone.y = height / 2;
      return clone;
    });
    const distribution = container.childDistribution === "vertical" ? "vertical" : "horizontal";
    return {
      ...cloneComponentTree(container),
      id: "voter-container-runtime",
      name: "Runtime Voter Container",
      x: width / 2,
      y: height / 2,
      width,
      height,
      scale: 1,
      rotation: 0,
      fillColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 0,
      childDistribution: distribution,
      children
    };
  }

  renderVoterArt(voters: Dict[] = [], options: Dict = {}): void {
    const previousVoterIds = new Set(this.currentVisibleVoters.map((voter) => String(voter?.id || "")));
    this.currentVisibleVoters = Array.isArray(voters) ? voters : [];
    const host = this.ensureVoterArtHost();
    if (!host) return;
    if (!this.voterArtRenderer || this.voterArtRenderer.host !== host) {
      this.voterArtRenderer = this.createArtTreeRenderer(host);
    }
    const container = this.component("voter-container");
    const root = this.voterArtRoot(this.currentVisibleVoters);
    if (!this.voterArtRenderer || !container || !root) {
      this.syncVoteCount(0);
      return;
    }
    this.voterArtRenderer.render([root], { width: Math.max(1, Number(container.width || 1)), height: Math.max(1, Number(container.height || 1)) }, { instant: true });
    this.voterArtRenderer.playComponent?.("voter-container-runtime", "On", { instant: true });
    this.currentVisibleVoters.forEach((voter, index) => {
      const voterId = safeComponentId(voter?.id, `voter-${index}`);
      if (!previousVoterIds.has(String(voter?.id || ""))) {
        this.voterArtRenderer?.playComponent?.(`vote-widget-${voterId}`, options.instant === true ? "On" : "Appear", {
          instant: options.instant === true
        });
      }
    });
    if (options.syncCount !== false) this.syncVoteCount(this.currentVisibleVoters.length);
  }

  syncVoters(cardData: Dict, options: Dict = {}): void {
    const voters = cardData.votesRevealed === true ? (cardData.voters as Dict[]) || [] : [];
    if (cardData.votesRevealed === true) {
      this.votersVisual.play("on");
      this.scheduleVoteReveal(voters, options);
    } else {
      this.clearVoteRevealTimers();
      this.voteRevealKey = "";
      this.voteRevealBadgeCount = 0;
      this.renderVoterArt([], { instant: true });
      this.voterArtRenderer?.clear({ instant: true });
      this.syncVoteCount(0);
      this.votersVisual.play("off", { instant: true });
    }
  }

  scheduleVoteReveal(voters: Dict[], options: Dict = {}): void {
    const revealKey = (options.voteRevealKey as string) || "instant";
    const staggerMs = Math.max(0, Number(options.voteRevealStaggerMs || 0));
    const voterKey = `${revealKey}:${voters.map((voter, index) => voter?.id || `voter-${index}`).join("|")}`;
    if (voterKey === this.voteRevealKey && voters.length === this.voteRevealBadgeCount) return;
    this.clearVoteRevealTimers();
    this.voteRevealKey = voterKey;
    this.voteRevealBadgeCount = voters.length;
    this.renderVoterArt([], { instant: true });
    if (!voters.length) return;
    voters.forEach((voter, index) => {
      const visibleVoteCount = index + 1;
      const delayMs = staggerMs > 0 ? visibleVoteCount * staggerMs : 0;
      if (delayMs === 0) {
        this.renderVoterArt(voters.slice(0, visibleVoteCount), { instant: options.instant === true });
        return;
      }
      const timerId = setTimeout(() => {
        if (this.voteRevealKey !== voterKey) return;
        this.renderVoterArt(voters.slice(0, visibleVoteCount), { instant: false });
      }, delayMs) as unknown as number;
      this.voteRevealTimers.push(timerId);
    });
  }

  renderComponentText(target: El | null, component: Dict | null, textOverride: unknown = NO_OVERRIDE): void {
    if (!target || !component) return;
    const text = textOverride !== NO_OVERRIDE ? String(textOverride ?? "") : String(component.defaultText || component.name || "");
    (w().PartyGameArtObject as { renderComponentText?: (t: El, c: Dict, text: string) => void } | undefined)?.renderComponentText?.(target, component, text);
  }

  remove(options: Dict = {}): number {
    this.clearVoteRevealTimers();
    this.rootArtRenderer?.clear({ instant: options.instant === true });
    this.voterArtRenderer?.clear({ instant: options.instant === true });
    for (const renderer of this.componentChildRenderers.values()) {
      renderer.clear({ instant: options.instant === true });
    }
    this.componentChildRenderers.clear();
    const duration = this.groupVisual.play(options.instant ? "off" : "disappear", { instant: options.instant === true });
    const element = this.element;
    const token = element.dataset.visualAnimationToken || "";
    const removeElement = () => {
      if (element.parentElement && element.dataset.visualAnimationToken === token) element.remove();
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
  avatarClass: unknown;
  avatarFrameImage: unknown;
  dinoIcon: unknown;
  playerAvatarArt: unknown;
  getComposition: unknown;
  gameObjectApi: unknown;
  cards = new Map<string, VotingCardView>();
  hideLayerTimer: number | null = null;

  constructor(options: Dict) {
    this.layer = options.layer as El | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.visualAnimation = options.visualAnimation;
    this.avatarClass = options.avatarClass;
    this.avatarFrameImage = options.avatarFrameImage;
    this.dinoIcon = options.dinoIcon;
    this.playerAvatarArt = options.playerAvatarArt;
    this.getComposition = options.getComposition;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
  }

  render(cards: Dict[] = [], options: Dict = {}): void {
    if (!this.layer) return;
    const list = Array.isArray(cards) ? cards : [];
    if (list.length) this.showLayer();
    const desiredIds = new Set(list.map((card) => card.id as string));
    for (const cardData of list) {
      let view = this.cards.get(cardData.id as string);
      if (!view) {
        view = new VotingCardView({
          document: this.document,
          visualAnimation: this.visualAnimation,
          avatarClass: this.avatarClass,
          avatarFrameImage: this.avatarFrameImage,
          dinoIcon: this.dinoIcon,
          playerAvatarArt: this.playerAvatarArt,
          getComposition: this.getComposition,
          gameObjectApi: this.gameObjectApi,
          cardId: cardData.id
        });
        this.cards.set(cardData.id as string, view);
        this.layer.appendChild(view.element);
      }
      view.sync(cardData, options);
    }
    let removalDuration = 0;
    for (const [cardId, view] of Array.from(this.cards.entries())) {
      if (desiredIds.has(cardId)) continue;
      this.cards.delete(cardId);
      removalDuration = Math.max(removalDuration, view.remove());
    }
    if (!list.length && !this.cards.size) {
      this.scheduleLayerHide(removalDuration);
    }
  }

  clear(options: Dict = {}): void {
    let removalDuration = 0;
    for (const [, view] of Array.from(this.cards.entries())) {
      removalDuration = Math.max(removalDuration, view.remove({ instant: options.instant !== false }));
    }
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
