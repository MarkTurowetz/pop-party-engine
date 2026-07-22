// Timeline-driven voting-card renderer. Voting cards mirror the Player Widget MC
// architecture: a parent MC owns independently addressable child MCs, while the
// card-art child owns a deeper stopped correctness-state timeline.

import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import type { TimelineDocument } from "../../shared/timeline-model";
import { runtimeSemanticCompositionId, type RuntimeSemanticRoleMap } from "./semanticRoleRuntime";

type Dict = Record<string, unknown>;
type El = HTMLElement;

interface VisualBridgeApi {
  createVisualForTarget?: (options: Dict) => Dict | undefined;
}

interface TreeRenderer {
  render: (components: Dict[], canvas: Dict, options: Dict) => void;
  clear: (options: Dict) => void;
  hasComponent?: (componentId: string) => boolean;
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

function targetCompletion(play: (complete: () => void) => number): Promise<void> {
  return new Promise((resolve) => {
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      resolve();
    };
    play(complete);
  });
}

const VOTING_CARD_ROLE = "engine.stage.votingCard";
export const VOTING_CARD_ART_MC_ID = "prefab-voting-card-art-mc";
export const VOTING_CARD_ANSWER_MC_ID = "prefab-voting-card-answer-mc";
export const VOTING_CARD_AUTHOR_MC_ID = "prefab-voting-card-author-mc";
export const VOTING_CARD_VOTE_COUNT_MC_ID = "prefab-voting-card-vote-count-mc";
export const VOTING_CARD_VOTERS_MC_ID = "prefab-voting-card-voters-mc";
export const VOTING_CARD_VOTER_MC_ID = "prefab-voting-card-voter-mc";
export const VOTING_CARD_VOTER_ID = "prefab-voting-card-voter";
export const VOTING_CARD_CORRECTNESS_STATE_ID = "prefab-voting-card-correctness-state";

export const VOTING_CARD_ART_COMPONENT_ID = "voting-card-art-mc";
export const VOTING_CARD_ANSWER_COMPONENT_ID = "voting-card-answer-mc";
export const VOTING_CARD_AUTHOR_COMPONENT_ID = "voting-card-author-mc";
export const VOTING_CARD_VOTE_COUNT_COMPONENT_ID = "voting-card-vote-count-mc";
export const VOTING_CARD_VOTERS_COMPONENT_ID = "voting-card-voters-mc";
export const VOTING_CARD_CORRECTNESS_COMPONENT_ID = "voting-card-correctness-state";
export const VOTING_CARD_ANSWER_STATE_COMPONENT_LABEL = "votingCardAnswerText";
export const VOTING_CARD_VOTER_CONTAINER_ID = "voting-card-voter-container";
export const VOTING_CARD_VOTER_COMPONENT_ID = "voting-card-voter-mc";
export const VOTING_CARD_VOTER_TEXT_ID = "voting-card-voter-text";
export const VOTING_CARD_VOTE_WIDGET_ID = VOTING_CARD_VOTER_COMPONENT_ID;

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

function authoredComponentTarget(composition: Dict | null, id: string, instanceLabel: string): string {
  const component = ((composition?.components as Dict[]) || []).find((item) => (
    item.id === id || item.instanceLabel === instanceLabel
  ));
  return component ? String(component.instanceLabel || component.id || "") : "";
}

function allComponents(components: Dict[] = []): Dict[] {
  return components.flatMap((component) => [
    component,
    ...allComponents(Array.isArray(component.children) ? component.children as Dict[] : [])
  ]);
}

function runtimeTextTarget(
  composition: Dict,
  preferredIds: string[],
  preferredLabels: string[]
): Dict | null {
  const components = allComponents((composition.components as Dict[]) || []);
  for (const id of preferredIds) {
    const target = components.find((component) => String(component.id || "") === id);
    if (target) return target;
  }
  for (const label of preferredLabels) {
    const target = components.find((component) => String(component.instanceLabel || "") === label);
    if (target) return target;
  }
  const textComponents = components.filter((component) => ["text", "badge"].includes(String(component.kind || "")));
  return textComponents.length === 1 ? textComponents[0] : null;
}

function applyRuntimeText(
  composition: Dict,
  value: string,
  preferredIds: string[],
  preferredLabels: string[]
): void {
  const target = runtimeTextTarget(composition, preferredIds, preferredLabels);
  if (!target) return;
  target.defaultText = value;
  const targetId = String(target.id || "");
  const timeline = composition.timeline as Dict | undefined;
  for (const track of (timeline?.tracks as Dict[]) || []) {
    if (String(track.targetId || "") !== targetId) continue;
    for (const keyframe of (track.keyframes as Dict[]) || []) {
      keyframe.props = { ...((keyframe.props as Dict) || {}), defaultText: value };
    }
  }
}

function compositionName(composition: Dict): string {
  return String(composition.name || "").trim().toLowerCase();
}

export function votingCardLifecycleComponentIds(composition: Dict | null): string[] {
  return [authoredComponentTarget(composition, VOTING_CARD_ANSWER_COMPONENT_ID, "answer")].filter(Boolean);
}

export function votingCardCompanionComponentIds(composition: Dict | null): string[] {
  return [
    authoredComponentTarget(composition, VOTING_CARD_ART_COMPONENT_ID, "cardArt"),
    authoredComponentTarget(composition, VOTING_CARD_AUTHOR_COMPONENT_ID, "author"),
    authoredComponentTarget(composition, VOTING_CARD_VOTERS_COMPONENT_ID, "voters"),
    authoredComponentTarget(composition, VOTING_CARD_VOTE_COUNT_COMPONENT_ID, "voteCount")
  ].filter(Boolean);
}

interface VotingCardVisibilityTransitionOptions {
  isShown: boolean;
  instant: boolean;
  playGate: (animation: "On" | "Off") => void;
  playPrimary: (animation: "On" | "Appear" | "Off" | "Disappear", complete: () => void) => number;
  playCompanions: () => void;
}

export function runVotingCardVisibilityTransition(options: VotingCardVisibilityTransitionOptions): Promise<void> {
  const nextShown = options.isShown !== false;
  const primaryAnimation = nextShown
    ? (options.instant ? "On" : "Appear")
    : (options.instant ? "Off" : "Disappear");
  if (nextShown) options.playGate("On");
  options.playCompanions();
  return targetCompletion((complete) => options.playPrimary(primaryAnimation, complete)).then(() => {
    if (!nextShown) options.playGate("Off");
  });
}

export interface VotingCardRuntimeState {
  answerText: string;
  authorText: string;
  voteCount: number;
  voters: Dict[];
}

const voterVariantSeparator = "::";

function voterVariantCompositionId(compositionId: string, voterId: unknown): string {
  return `${compositionId}${voterVariantSeparator}${safeComponentId(voterId, "voter")}`;
}

function voterVariant(compositionId: string): { baseId: string; voterId: string } | null {
  for (const baseId of [VOTING_CARD_VOTER_MC_ID, VOTING_CARD_VOTER_ID]) {
    const prefix = `${baseId}${voterVariantSeparator}`;
    if (compositionId.startsWith(prefix)) return { baseId, voterId: compositionId.slice(prefix.length) };
  }
  return null;
}

function runtimeVoter(state: VotingCardRuntimeState, voterId: string): Dict | null {
  return state.voters.find((voter, index) => safeComponentId(voter.id, `voter-${index}`) === voterId) || null;
}

export function votingCardRuntimeBaseCompositionId(compositionId: string): string {
  return voterVariant(compositionId)?.baseId || compositionId;
}

export function runtimeVotingCardComposition(composition: Dict, compositionId: string, state: VotingCardRuntimeState): Dict {
  const runtime = cloneComposition(composition);
  const components = (runtime.components as Dict[]) || [];
  const variant = voterVariant(compositionId);
  if (variant?.baseId === VOTING_CARD_VOTER_MC_ID) {
    const reference = components.find((component) => component.kind === "reference");
    if (reference) reference.artCompositionId = voterVariantCompositionId(VOTING_CARD_VOTER_ID, variant.voterId);
  } else if (variant?.baseId === VOTING_CARD_VOTER_ID) {
    const voter = runtimeVoter(state, variant.voterId);
    const voterName = String(voter?.name || "Player");
    applyRuntimeText(runtime, voterName, [VOTING_CARD_VOTER_TEXT_ID], ["playerName"]);
  } else if (compositionId === VOTING_CARD_VOTERS_MC_ID) {
    const container = components.find((component) => component.id === VOTING_CARD_VOTER_CONTAINER_ID);
    const template = ((container?.children as Dict[]) || []).find((component) =>
      component.id === VOTING_CARD_VOTER_COMPONENT_ID || component.artCompositionId === VOTING_CARD_VOTER_MC_ID
    );
    if (container && template) {
      container.children = state.voters.map((voter, index) => ({
        ...cloneComponent(template),
        id: `${VOTING_CARD_VOTER_COMPONENT_ID}-${safeComponentId(voter.id, `voter-${index}`)}`,
        instanceLabel: `vote${index + 1}`,
        name: voter.name ? `Vote ${voter.name}` : `Vote ${index + 1}`,
        kind: "reference",
        artCompositionId: voterVariantCompositionId(VOTING_CARD_VOTER_MC_ID, safeComponentId(voter.id, `voter-${index}`)),
        defaultAnimationState: "Off"
      }));
    }
  }

  const name = compositionName(runtime);
  if (compositionId === VOTING_CARD_ANSWER_MC_ID || name === "voting card answer text") {
    applyRuntimeText(runtime, state.answerText, ["voting-card-answer-text"], ["answerText", "text"]);
  }
  if (compositionId === VOTING_CARD_AUTHOR_MC_ID || name === "voting card author text") {
    applyRuntimeText(runtime, state.authorText, ["voting-card-author-text", "voting-card-author-text-content"], ["authorText"]);
  }
  if (compositionId === VOTING_CARD_VOTE_COUNT_MC_ID || name === "voting card vote") {
    applyRuntimeText(
      runtime,
      state.voteCount > 0 ? String(state.voteCount) : "",
      ["voting-card-vote-count", "voting-card-vote-count-text"],
      ["voteCountText"]
    );
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
  votingCardCompositionId: string;
  cardId: string;
  element: El;
  artHost: El;
  rootRenderer: TreeRenderer | null;
  groupVisual: VisualLike;
  cardData: Dict = {};
  currentVisibleVoters: Dict[] = [];
  desiredShown = false;

  constructor(options: Dict) {
    this.document = options.document as Document;
    this.visualAnimation = options.visualAnimation;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.getComposition = options.getComposition as (id: string) => Dict | null;
    this.votingCardCompositionId = String(options.votingCardCompositionId || "");
    this.cardId = String(options.cardId || "card");
    this.element = createVotingCardElement(this.document, this.cardId);
    this.artHost = this.element.querySelector(".voting-card-art-objects") as El;
    this.rootRenderer = this.createRenderer();
    const parent = this.composition(this.votingCardCompositionId);
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
    if (!authored) throw new Error(`Required voting-card composition is missing: ${id}`);
    return authored;
  }

  runtimeState(): VotingCardRuntimeState {
    const reportedVoteCount = Number(this.cardData.voteCount);
    return {
      answerText: String(this.cardData.text || ""),
      authorText: String(this.cardData.authorName || ""),
      voteCount: Number.isFinite(reportedVoteCount) ? Math.max(0, reportedVoteCount) : this.currentVisibleVoters.length,
      voters: this.currentVisibleVoters
    };
  }

  runtimeComposition(id: string): Dict | null {
    const composition = this.composition(votingCardRuntimeBaseCompositionId(id));
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
    const parent = this.runtimeComposition(this.votingCardCompositionId);
    if (!parent || !this.rootRenderer) return;
    const canvas = (parent.canvas as Dict) || { width: 560, height: 230 };
    this.element.style.width = `${Number(canvas.width || 560)}px`;
    this.element.style.height = `${Number(canvas.height || 230)}px`;
    this.rootRenderer.render((parent.components as Dict[]) || [], canvas, { instant: true });
  }

  playChild(componentId: string, animation: string, options: Dict = {}): number {
    if (!this.rootRenderer?.hasComponent?.(componentId)) {
      throw new Error(`Voting card ${this.cardId} is missing required target ${componentId}`);
    }
    return this.rootRenderer.playComponent?.(componentId, animation, options) || 0;
  }

  renderData(cardData: Dict): void {
    this.cardData = cardData;
    this.currentVisibleVoters = Array.isArray(cardData.voters) ? (cardData.voters as Dict[]) : [];
    this.renderArt();
    this.element.dataset.votingCardInitialized = "true";
    this.element.dataset.authorsRevealed = cardData.authorsRevealed === true ? "true" : "false";
    this.element.dataset.winnerRevealed = cardData.isWinner === true ? "true" : "false";
  }

  setShown(isShown: boolean, options: Dict = {}): Promise<void> {
    const nextShown = isShown !== false;
    if (this.desiredShown === nextShown) return Promise.resolve();
    this.desiredShown = nextShown;
    const instant = options.instant === true;
    if (nextShown) this.element.classList.remove("voting-card-group-hidden");
    const parent = this.runtimeComposition(this.votingCardCompositionId);
    const primaryTargetId = votingCardLifecycleComponentIds(parent)[0];
    if (!primaryTargetId) {
      return Promise.reject(new Error(`Voting card ${this.cardId} is missing its primary lifecycle target`));
    }
    return runVotingCardVisibilityTransition({
      isShown: nextShown,
      instant,
      // The compound Voting Card Widget MC is an immediate availability gate.
      // It must remain On until the one directly-awaited card visual finishes
      // Disappear, otherwise the authored exit is hidden before it can play.
      playGate: (animation) => {
        this.groupVisual?.play?.(animation, { instant: true });
      },
      // Set Voting Cards Shown owns one callback target per card. Nested author,
      // voter, and count animations cannot satisfy or delay that action barrier.
      playPrimary: (animation, complete) => this.playChild(primaryTargetId, animation, { instant, complete }),
      playCompanions: () => {
        for (const componentId of votingCardCompanionComponentIds(parent)) {
          if (nextShown && !["cardArt", VOTING_CARD_ART_COMPONENT_ID].includes(componentId)) continue;
          if (!nextShown && this.rootRenderer?.isComponentVisible?.(componentId) !== true) continue;
          const hasAuthoredExit = !["voters", VOTING_CARD_VOTERS_COMPONENT_ID].includes(componentId);
          const companionAnimation = nextShown
            ? (instant ? "On" : "Appear")
            : (instant || !hasAuthoredExit ? "Off" : "Disappear");
          this.playChild(
            componentId,
            companionAnimation,
            { instant: instant || (!nextShown && !hasAuthoredExit) }
          );
        }
      }
    });
  }

  revealAuthor(options: Dict = {}): Promise<void> {
    const instant = options.instant === true;
    const parent = this.runtimeComposition(this.votingCardCompositionId);
    const authorTarget = authoredComponentTarget(parent, VOTING_CARD_AUTHOR_COMPONENT_ID, "author") || VOTING_CARD_AUTHOR_COMPONENT_ID;
    return targetCompletion((complete) => this.playChild(
      authorTarget,
      instant ? "On" : "Appear",
      { instant, complete }
    ));
  }

  revealCorrectness(): Promise<void> {
    const hasAnswerState = this.rootRenderer?.hasComponent?.(VOTING_CARD_ANSWER_STATE_COMPONENT_LABEL) === true;
    const targetId = hasAnswerState ? VOTING_CARD_ANSWER_STATE_COMPONENT_LABEL : VOTING_CARD_CORRECTNESS_COMPONENT_ID;
    if (!this.rootRenderer?.hasComponent?.(targetId)) {
      return Promise.reject(new Error(`Voting card ${this.cardId} is missing its correctness-state target`));
    }
    const state = hasAnswerState
      ? (this.cardData.isWinner === true ? "Correct" : "Incorrect")
      : (this.cardData.isWinner === true ? "Correct" : "Neutral");
    return targetCompletion((complete) => this.rootRenderer!.stopAtComponent!(targetId, state, { instant: true, complete }));
  }

  voterComponentId(voter: Dict, index: number): string {
    void voter;
    return `vote${index + 1}`;
  }

  revealVoters(options: Dict = {}): Promise<void> {
    const voters = this.currentVisibleVoters;
    if (!voters.length) return Promise.resolve();
    const instant = options.instant === true;
    const parent = this.runtimeComposition(this.votingCardCompositionId);
    const votersTarget = authoredComponentTarget(parent, VOTING_CARD_VOTERS_COMPONENT_ID, "voters") || VOTING_CARD_VOTERS_COMPONENT_ID;
    const voteCountTarget = authoredComponentTarget(parent, VOTING_CARD_VOTE_COUNT_COMPONENT_ID, "voteCount") || VOTING_CARD_VOTE_COUNT_COMPONENT_ID;
    const completions = [targetCompletion((complete) => this.playChild(
      votersTarget,
      "On",
      { instant: true, complete }
    )), ...voters.map((voter, index) => targetCompletion((complete) => this.playChild(
      this.voterComponentId(voter, index),
      instant ? "On" : "Appear",
      { instant, complete }
    )))];
    completions.push(targetCompletion((complete) => this.playChild(
      voteCountTarget,
      instant ? "On" : "Appear",
      { instant, complete }
    )));
    return Promise.all(completions).then(() => undefined);
  }

  removeImmediately(): void {
    this.rootRenderer?.clear({ instant: true });
    this.element.remove();
  }
}

class VotingCardRenderer {
  layer?: El;
  document: Document;
  visualAnimation: unknown;
  getComposition: (id: string) => Dict | null;
  gameObjectApi: unknown;
  votingCardCompositionId: string;
  cards = new Map<string, VotingCardView>();
  pendingRemovalIds = new Set<string>();
  hideLayerTimer: number | null = null;
  visitId = "";

  constructor(options: Dict) {
    this.layer = options.layer as El | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.visualAnimation = options.visualAnimation;
    this.getComposition = options.getComposition as (id: string) => Dict | null;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.votingCardCompositionId = runtimeSemanticCompositionId(
      VOTING_CARD_ROLE,
      options.semanticRoles as RuntimeSemanticRoleMap | undefined,
      this.document
    );
  }

  render(cards: Dict[] = [], options: Dict = {}): void {
    if (!this.layer) return;
    const nextVisitId = String(options.visitId || "");
    if (nextVisitId && this.visitId && nextVisitId !== this.visitId) {
      this.clear({ instant: true });
    }
    if (nextVisitId) this.visitId = nextVisitId;
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
          votingCardCompositionId: this.votingCardCompositionId,
          cardId
        });
        this.cards.set(cardId, view);
        this.layer.appendChild(view.element);
      }
      view.renderData(cardData);
    }
    const preserveForHideAction = options.actionType === "setVotingCardsShown" && options.isShown === false;
    for (const [cardId, view] of Array.from(this.cards.entries())) {
      if (desiredIds.has(cardId)) continue;
      if (preserveForHideAction) {
        this.pendingRemovalIds.add(cardId);
        continue;
      }
      this.cards.delete(cardId);
      this.pendingRemovalIds.delete(cardId);
      view.removeImmediately();
    }
    if (!list.length && !this.cards.size) this.scheduleLayerHide();
  }

  matchesFilter(view: VotingCardView, filter: string): boolean {
    if (filter === "winners") return view.cardData.isWinner === true;
    if (filter === "losers") return view.cardData.isWinner !== true;
    return true;
  }

  runAction(action: Dict = {}): Promise<void> {
    const actionType = String(action.type || "");
    const instant = action.instant === true;
    const views = Array.from(this.cards.values());
    if (actionType === "setVotingCardsShown") {
      const filter = String(action.cardFilter || "all");
      const targets = views.filter((view) => this.pendingRemovalIds.has(view.cardId) || this.matchesFilter(view, filter));
      if (action.isShown !== false) this.showLayer();
      return Promise.all(targets.map((view) => view.setShown(action.isShown !== false, { instant }))).then(() => {
        if (action.isShown === false) {
          for (const view of targets) {
            if (!this.pendingRemovalIds.has(view.cardId)) continue;
            this.pendingRemovalIds.delete(view.cardId);
            this.cards.delete(view.cardId);
            view.removeImmediately();
          }
          if (!this.cards.size) this.scheduleLayerHide();
        }
      });
    }
    const completions: Promise<void>[] = [];
    for (const view of views) {
      if (["revealAuthors", "revealVotingResults"].includes(actionType)) completions.push(view.revealAuthor({ instant }));
      if (["revealVotes", "revealVotingResults"].includes(actionType)) completions.push(view.revealVoters({ instant }));
      if (["revealWinningAnswer", "revealVotingResults"].includes(actionType)) completions.push(view.revealCorrectness());
    }
    return Promise.all(completions).then(() => undefined);
  }

  clear(_options: Dict = {}): void {
    for (const view of this.cards.values()) {
      view.removeImmediately();
    }
    this.cards.clear();
    this.pendingRemovalIds.clear();
    this.scheduleLayerHide();
  }

  showLayer(): void {
    if (this.hideLayerTimer !== null) clearTimeout(this.hideLayerTimer);
    this.hideLayerTimer = null;
    this.layer?.classList.remove("hidden");
  }

  scheduleLayerHide(): void {
    if (this.hideLayerTimer !== null) clearTimeout(this.hideLayerTimer);
    if (!this.layer) return;
    if (!this.cards.size) this.layer.classList.add("hidden");
  }
}

export const PartyGameVotingCardVisuals = {
  createRenderer: (options: Dict) => new VotingCardRenderer(options)
};

export function installStageVotingCardVisualsGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameVotingCardVisuals = PartyGameVotingCardVisuals;
}

installStageVotingCardVisualsGlobals(typeof window !== "undefined" ? window : globalThis);
