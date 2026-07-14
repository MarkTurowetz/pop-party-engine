import type { ArtApi } from "../../api/artApi";
import type { ArtComponent, ArtComposition, JsonObject } from "../../types/game-data";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import {
  artCompositionSnapshot,
  hydrateArtCompositionForEditing,
  hydrateArtCompositionsForEditing,
  hydrateArtComponentForEditing,
  normalizeArtCompositionKind,
  normalizeArtCompositionSurface,
  serializeArtCompositionForSave,
  type ArtCompositionKind
} from "./artCompositionModel";
import { componentKindLabel, defaultTextFontFamily, normalizeCreatableComponentKind } from "./artComponentSchema";
import { artCompositionContentBounds } from "./artCompositionBounds";
import { artCompositionFrameZeroOverrides } from "./artReferenceFrameOverrides";
import { mergeDefaultArtVisibilityTimeline } from "./artTimelineModel";
import {
  artWorkspaceId,
  isArtWorkspaceId,
  readArtWorkspaces,
  writeArtWorkspaces,
  type ArtWorkspaceStorage,
  type ArtWorkspaceSurface
} from "./artWorkspaceModel";
import {
  ART_TIMELINE_ARCHITECTURE_VERSION,
  assignUniqueArtInstanceLabels,
  migrateArtTimelineArchitecture,
  suggestedArtInstanceLabel,
  validArtInstanceLabel
} from "../../../shared/art-timeline-architecture";

/**
 * Controller for the Art composition editor: a list of compositions, each a nested
 * tree of components. Tracks per-composition dirty state (serialized vs saved
 * snapshot) and saves each changed composition via ArtApi.saveArtComposition.
 */
export interface ArtCompositionsEditorState {
  compositions: ArtComposition[];
  workspaces: Record<ArtWorkspaceSurface, ArtComposition>;
  selectedCompositionId: string;
  selectedComponentIds: Set<string>;
  dirtyCompositionIds: Set<string>;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
  migrationSummary: {
    compositionCount: number;
    removedTrackCount: number;
    removedKeyframeCount: number;
    removedComponentTimelineCount: number;
  } | null;
}

export interface ArtCompositionsControllerOptions {
  initialCompositions: ArtComposition[];
  api: ArtApi;
  postDraft?: (message: JsonObject) => Promise<unknown>;
  draftPublishDelayMs?: number;
  workspaceStorage?: ArtWorkspaceStorage | null;
}

export interface ConvertArtSelectionOptions {
  name: string;
  kind?: ArtCompositionKind;
  frameOverrides?: Record<string, Record<string, unknown>> | null;
}

export interface ConvertedArtSelection {
  composition: ArtComposition;
  reference: ArtComponent;
}

export interface ArtCompositionsController {
  getState(): ArtCompositionsEditorState;
  subscribe(listener: () => void): () => void;
  createComposition(kind: ArtCompositionKind, surface: string, name?: string): ArtComposition;
  duplicateComposition(compositionId: string): ArtComposition | null;
  createPrefabFromComponents(sourceCompositionId: string, componentIds: Iterable<string>, name: string): ArtComposition | null;
  convertSelectedComponentsToComposition(options: ConvertArtSelectionOptions): ConvertedArtSelection | null;
  updateComposition(compositionId: string, patch: Partial<ArtComposition>): void;
  selectComposition(compositionId: string): void;
  selectWorkspace(surface: ArtWorkspaceSurface): void;
  selectComponent(componentId: string, additive?: boolean): void;
  selectComponents(componentIds: Iterable<string>, additive?: boolean): void;
  clearComponentSelection(): void;
  addComponent(kind: string, options?: AddArtComponentOptions): ArtComponent | null;
  removeSelectedComponents(): void;
  removeSelectedComposition(): void;
  updateComponent(componentId: string, patch: Partial<ArtComponent>): void;
  swapReferenceGameObject(componentId: string, compositionId: string): void;
  moveComponent(componentId: string, x: number, y: number): void;
  reorderComponent(componentId: string, targetComponentId: string, placement: "before" | "after"): void;
  undo(): void;
  redo(): void;
  save(): Promise<boolean>;
}

export interface AddArtComponentOptions {
  parentComponentId?: string;
  referencedCompositionId?: string;
  x?: number;
  y?: number;
}

const HISTORY_LIMIT = 50;
const DEFAULT_COMPOSITION_CANVAS = { width: 560, height: 230 };

function makeArtId(kind: string): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  const token = cryptoObj?.randomUUID ? cryptoObj.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${kind}-${token}`;
}

function cleanCompositionName(name: string | undefined, fallback: string): string {
  return String(name || "").trim() || fallback;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function uniqueCompositionId(name: string, kind: ArtCompositionKind, compositions: ArtComposition[]): string {
  const prefix = kind === "prefab" ? "prefab" : "game-object";
  const base = `${prefix}-${slugify(name, prefix)}`;
  const used = new Set(compositions.map((composition) => composition.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function duplicateCompositionName(name: string, compositions: ArtComposition[]): string {
  const cleanName = cleanCompositionName(name, "Composition");
  const numbered = cleanName.match(/^(.*?)(?:\s+(\d+))?$/);
  const base = String(numbered?.[1] || cleanName).trim() || "Composition";
  const startingNumber = numbered?.[2] ? Number(numbered[2]) + 1 : 1;
  const usedNames = new Set(compositions.map((composition) => String(composition.name || "").trim().toLowerCase()));
  let suffix = Math.max(1, startingNumber);
  while (usedNames.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

function createComposition(kind: ArtCompositionKind, surface: string, name: string | undefined, compositions: ArtComposition[]): ArtComposition {
  const cleanKind = normalizeArtCompositionKind(kind);
  const label = cleanKind === "prefab" ? "Prefab" : "Game Object";
  const cleanName = cleanCompositionName(name, label);
  return {
    id: uniqueCompositionId(cleanName, cleanKind, compositions),
    name: cleanName,
    description: cleanKind === "prefab" ? "Reusable art prefab." : "Editable game object.",
    surface: normalizeArtCompositionSurface(surface),
    compositionKind: cleanKind,
    isCustom: true,
    timelineArchitectureVersion: ART_TIMELINE_ARCHITECTURE_VERSION,
    canvas: { ...DEFAULT_COMPOSITION_CANVAS },
    timeline: mergeDefaultArtVisibilityTimeline(null),
    components: []
  };
}

function referenceComponentPatch(composition: ArtComposition, compositions: ArtComposition[] = []): Partial<ArtComponent> {
  const compositionById = new Map(compositions.map((item) => [String(item.id || ""), item]));
  compositionById.set(String(composition.id || ""), composition);
  const contentBounds = artCompositionContentBounds(composition, compositionById, {
    timelineFrameOverrides: artCompositionFrameZeroOverrides(composition, compositionById)
  });
  return {
    name: composition.name,
    width: Number(contentBounds.width || composition.canvas?.width || DEFAULT_COMPOSITION_CANVAS.width),
    height: Number(contentBounds.height || composition.canvas?.height || DEFAULT_COMPOSITION_CANVAS.height),
    artCompositionId: composition.id
  };
}

interface ArtCompositionIntrinsicSize {
  width: number;
  height: number;
}

function compositionIntrinsicSizes(compositions: ArtComposition[]): Map<string, ArtCompositionIntrinsicSize> {
  return new Map(compositions.map((composition) => {
    const patch = referenceComponentPatch(composition, compositions);
    return [composition.id, { width: Number(patch.width || 1), height: Number(patch.height || 1) }];
  }));
}

function synchronizeTimelineReferenceDimensions(
  composition: ArtComposition,
  referenceId: string,
  nextSize: ArtCompositionIntrinsicSize
): boolean {
  if (!composition.timeline) return false;
  let changed = false;
  const tracks = (composition.timeline.tracks || []).map((track) => {
    if (track.targetId !== referenceId) return track;
    const keyframes = (track.keyframes || []).map((keyframe) => {
      const props = { ...(keyframe.props || {}) };
      let keyframeChanged = false;
      if (Object.prototype.hasOwnProperty.call(props, "width") && Number(props.width) !== nextSize.width) {
        props.width = nextSize.width;
        keyframeChanged = true;
      }
      if (Object.prototype.hasOwnProperty.call(props, "height") && Number(props.height) !== nextSize.height) {
        props.height = nextSize.height;
        keyframeChanged = true;
      }
      if (!keyframeChanged) return keyframe;
      changed = true;
      return { ...keyframe, props };
    });
    return changed ? { ...track, keyframes } : track;
  });
  if (changed) composition.timeline = { ...composition.timeline, tracks };
  return changed;
}

/**
 * Reference width and height are intrinsic source geometry. Placed instances
 * animate their apparent size through scale, so stale base values and stamped
 * keyframe dimensions are always synchronized to the referenced composition.
 * Repeating the pass carries a source change through parents and grandparents.
 */
function synchronizeReferenceDimensions(compositions: ArtComposition[]): void {
  const measurableCompositionIds = new Set(
    compositions.filter((composition) => (composition.components || []).length > 0).map((composition) => composition.id)
  );
  for (let pass = 0; pass < Math.max(1, compositions.length); pass += 1) {
    const nextSizes = compositionIntrinsicSizes(compositions);
    let changed = false;
    for (const owner of compositions) {
      const visit = (components: ArtComponent[]): void => {
        for (const component of components || []) {
          if (component.kind === "reference" && component.artCompositionId) {
            const nextSize = nextSizes.get(component.artCompositionId);
            if (nextSize && measurableCompositionIds.has(component.artCompositionId)) {
              if (Number(component.width) !== nextSize.width) {
                component.width = nextSize.width;
                changed = true;
              }
              if (Number(component.height) !== nextSize.height) {
                component.height = nextSize.height;
                changed = true;
              }
              if (synchronizeTimelineReferenceDimensions(owner, component.id, nextSize)) changed = true;
            }
          }
          visit(component.children || []);
        }
      };
      visit(owner.components || []);
    }
    if (!changed) return;
  }
}

function createComponent(
  kind: string,
  bounds: { width: number; height: number },
  referencedComposition: ArtComposition | null = null,
  compositions: ArtComposition[] = []
): ArtComponent {
  const cleanKind = normalizeCreatableComponentKind(kind);
  const referencePatch = cleanKind === "reference" && referencedComposition ? referenceComponentPatch(referencedComposition, compositions) : null;
  const width =
    Number(referencePatch?.width || 0) || (cleanKind === "text" ? 220 : cleanKind === "container" ? 320 : cleanKind === "reference" ? 220 : 180);
  const height =
    Number(referencePatch?.height || 0) || (cleanKind === "text" ? 60 : cleanKind === "container" ? 140 : cleanKind === "reference" ? 120 : 96);
  const component: Record<string, unknown> = {
    id: makeArtId(cleanKind),
    name: referencePatch?.name || componentKindLabel(cleanKind),
    instanceLabel: suggestedArtInstanceLabel(referencePatch?.name || componentKindLabel(cleanKind)),
    kind: cleanKind,
    x: Number(bounds.width || 560) / 2,
    y: Number(bounds.height || 230) / 2,
    width,
    height,
    scale: 1,
    rotation: 0,
    transformOrigin: "center",
    editorHidden: false,
    children: []
  };
  if (cleanKind === "reference") {
    component.artCompositionId = String(referencePatch?.artCompositionId || "");
  }
  if (cleanKind === "text") {
    component.defaultText = "TEXT";
    component.fontSize = 48;
    component.autoFitText = false;
    component.fontColor = "#17131f";
    component.fontFamily = defaultTextFontFamily;
  }
  if (cleanKind === "sprite") {
    component.imageAssetId = "";
    component.imageDataUrl = "";
    component.imageObjectFit = "contain";
    component.imageTint = "currentColor";
    component.spriteRenderMode = "original";
  }
  if (cleanKind === "shape") {
    component.shapeStyle = "rounded";
    component.fillColor = "#fff8d6";
    component.borderColor = "#17131f";
    component.borderWidth = 5;
    component.borderRadius = 16;
  }
  return component as ArtComponent;
}

function cloneTimelineWithIds(timeline: ArtComponent["timeline"], idMap: Map<string, string>): ArtComponent["timeline"] {
  if (!timeline) return timeline;
  const clone = JSON.parse(JSON.stringify(timeline)) as NonNullable<ArtComponent["timeline"]>;
  clone.tracks = (clone.tracks || []).map((track) => {
    const targetId = String(track.targetId || "");
    return {
      ...track,
      targetId: idMap.get(targetId) || targetId
    };
  });
  clone.commands = (clone.commands || []).map((command) => {
    const target = String(command.target || "");
    return {
      ...command,
      target: idMap.get(target) || command.target
    };
  });
  return clone;
}

function cloneComponentForPrefab(component: ArtComponent, idMap: Map<string, string>): ArtComponent {
  const clone = JSON.parse(JSON.stringify(component)) as ArtComponent;
  const nextId = makeArtId(String(clone.kind || "component"));
  idMap.set(String(component.id || ""), nextId);
  clone.id = nextId;
  clone.children = (component.children || []).map((child) => cloneComponentForPrefab(child, idMap));
  return clone;
}

function applyClonedTimelineIds(component: ArtComponent, idMap: Map<string, string>): ArtComponent {
  component.timeline = cloneTimelineWithIds(component.timeline, idMap);
  component.children = (component.children || []).map((child) => applyClonedTimelineIds(child, idMap));
  return hydrateArtComponentForEditing(component);
}

function componentBounds(component: ArtComponent): { minX: number; minY: number; maxX: number; maxY: number } {
  const width = Math.max(1, Number(component.width || 1));
  const height = Math.max(1, Number(component.height || 1));
  const scale = Math.max(0.001, Math.abs(Number(component.scale || 1)));
  const x = Number(component.x || 0);
  const y = Number(component.y || 0);
  return {
    minX: x - (width * scale) / 2,
    minY: y - (height * scale) / 2,
    maxX: x + (width * scale) / 2,
    maxY: y + (height * scale) / 2
  };
}

function selectedRootComponents(sourceComponents: ArtComponent[], ids: Set<string>): ArtComponent[] {
  const output: ArtComponent[] = [];
  const visit = (components: ArtComponent[], ancestorSelected: boolean): void => {
    for (const component of components || []) {
      const selected = ids.has(component.id);
      if (selected && !ancestorSelected) output.push(component);
      visit(component.children || [], ancestorSelected || selected);
    }
  };
  visit(sourceComponents, false);
  return output;
}

function canvasForComponents(components: ArtComponent[]): { canvas: { width: number; height: number }; offsetX: number; offsetY: number } {
  const padding = 40;
  if (!components.length) return { canvas: { ...DEFAULT_COMPOSITION_CANVAS }, offsetX: 0, offsetY: 0 };
  const first = componentBounds(components[0]);
  const total = components.slice(1).reduce(
    (bounds, component) => {
      const next = componentBounds(component);
      return {
        minX: Math.min(bounds.minX, next.minX),
        minY: Math.min(bounds.minY, next.minY),
        maxX: Math.max(bounds.maxX, next.maxX),
        maxY: Math.max(bounds.maxY, next.maxY)
      };
    },
    first
  );
  return {
    canvas: {
      width: Math.max(1, Number((total.maxX - total.minX + padding * 2).toFixed(3))),
      height: Math.max(1, Number((total.maxY - total.minY + padding * 2).toFixed(3)))
    },
    offsetX: -total.minX + padding,
    offsetY: -total.minY + padding
  };
}

function findComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  for (const component of components) {
    if (component.id === id) return component;
    const found = component.children ? findComponent(component.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

function findSiblingGroup(
  components: ArtComponent[],
  id: string,
  owner: ArtComponent | null = null
): { owner: ArtComponent | null; siblings: ArtComponent[] } | null {
  if (components.some((component) => component.id === id)) return { owner, siblings: components };
  for (const component of components) {
    const found = component.children ? findSiblingGroup(component.children, id, component) : null;
    if (found) return found;
  }
  return null;
}

function reorderedSiblings(
  siblings: ArtComponent[],
  componentId: string,
  targetComponentId: string,
  placement: "before" | "after"
): ArtComponent[] | null {
  if (componentId === targetComponentId) return null;
  const fromIndex = siblings.findIndex((component) => component.id === componentId);
  const targetIndex = siblings.findIndex((component) => component.id === targetComponentId);
  if (fromIndex < 0 || targetIndex < 0) return null;
  const originalOrder = siblings.map((component) => component.id).join("\u0000");
  const next = siblings.slice();
  const [component] = next.splice(fromIndex, 1);
  const nextTargetIndex = next.findIndex((item) => item.id === targetComponentId);
  if (nextTargetIndex < 0 || !component) return null;
  next.splice(placement === "after" ? nextTargetIndex + 1 : nextTargetIndex, 0, component);
  return next.map((item) => item.id).join("\u0000") === originalOrder ? null : next;
}

function collectComponentTreeIds(component: ArtComponent, ids: Set<string>): void {
  ids.add(component.id);
  for (const child of component.children || []) collectComponentTreeIds(child, ids);
}

function collectComponentTreeCommandTargets(component: ArtComponent, targets: Set<string>): void {
  for (const value of [component.id, component.instanceLabel, component.name]) {
    const clean = String(value || "").trim();
    if (clean) targets.add(clean);
  }
  for (const child of component.children || []) collectComponentTreeCommandTargets(child, targets);
}

function commandTargetsSelection(target: unknown, selectedTargets: Set<string>): boolean {
  const clean = String(target || "").trim();
  if (!clean) return false;
  if (selectedTargets.has(clean)) return true;
  return clean.split("/").some((part) => selectedTargets.has(part));
}

function removeTimelineTracksForIds(composition: ArtComposition, removedIds: Set<string>): ArtComposition {
  if (!removedIds.size || !composition.timeline) return composition;
  return {
    ...composition,
    timeline: {
      ...composition.timeline,
      tracks: (composition.timeline.tracks || []).filter((track) => !removedIds.has(String(track.targetId || "")))
    }
  };
}

function componentWithFrameOverrides(
  component: ArtComponent,
  frameOverrides: Record<string, Record<string, unknown>> | null | undefined
): ArtComponent {
  const direct = frameOverrides?.[component.id];
  const scoped = direct || Object.entries(frameOverrides || {}).find(([key]) => key.split("/").at(-1) === component.id)?.[1];
  const clone = { ...component, ...(scoped || {}) } as ArtComponent;
  clone.children = (component.children || []).map((child) => componentWithFrameOverrides(child, frameOverrides));
  return clone;
}

function uniqueInstanceLabelForComposition(composition: ArtComposition, requestedName: string): string {
  const used = new Set<string>();
  const visit = (components: ArtComponent[]): void => {
    for (const component of components) {
      if (component.instanceLabel) used.add(String(component.instanceLabel));
      visit(component.children || []);
    }
  };
  visit(composition.components || []);
  const base = suggestedArtInstanceLabel(requestedName);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function safeInitialCompositionCleanup(source: ArtComposition[]): ArtComposition[] {
  const inbound = new Set<string>();
  const visit = (components: ArtComponent[]): void => {
    for (const component of components || []) {
      if (component.kind === "reference" && component.artCompositionId) inbound.add(String(component.artCompositionId));
      visit(component.children || []);
    }
  };
  for (const composition of source) visit(composition.components || []);
  return source.filter((composition) => !(
    String(composition.name || "").trim() === "Untitled Prefab" &&
    (composition.components || []).length === 0 &&
    !inbound.has(composition.id)
  ));
}

function removeComponentsMatching(
  components: ArtComponent[],
  shouldRemove: (component: ArtComponent) => boolean,
  removedIds: Set<string>
): ArtComponent[] {
  return components.flatMap((component) => {
    if (shouldRemove(component)) {
      collectComponentTreeIds(component, removedIds);
      return [];
    }
    return [{
      ...component,
      children: component.children ? removeComponentsMatching(component.children, shouldRemove, removedIds) : component.children
    }];
  });
}

function withoutRemovedTimelineTargets(composition: ArtComposition, removedIds: Set<string>): ArtComposition {
  if (!removedIds.size || !composition.timeline) return composition;
  return {
    ...composition,
    timeline: {
      ...composition.timeline,
      tracks: (composition.timeline.tracks || []).filter((track) => !removedIds.has(track.targetId)),
      commands: (composition.timeline.commands || []).filter((command) =>
        (command.type !== "playComponent" && command.type !== "stopComponent") || !removedIds.has(String(command.target || ""))
      )
    }
  };
}

function compositionsDraftSnapshot(compositions: ArtComposition[]): string {
  return JSON.stringify(compositions.map((composition) => serializeArtCompositionForSave(composition)));
}

export function createArtCompositionsController(
  options: ArtCompositionsControllerOptions
): ArtCompositionsController {
  const { api } = options;
  const listeners = new Set<() => void>();
  const sourceCompositions = options.initialCompositions || [];
  const cleanedSourceCompositions = safeInitialCompositionCleanup(sourceCompositions);
  const migration = migrateArtTimelineArchitecture(cleanedSourceCompositions);
  let pendingMigrationSummary = migration.migratedCompositionIds.length
    ? {
        compositionCount: migration.migratedCompositionIds.length,
        removedTrackCount: migration.removedTrackCount,
        removedKeyframeCount: migration.removedKeyframeCount,
        removedComponentTimelineCount: migration.removedComponentTimelineCount
      }
    : null;
  let compositions = hydrateArtCompositionsForEditing(migration.compositions);
  const workspaceStorage = options.workspaceStorage === undefined
    ? (typeof window !== "undefined" ? window.localStorage : null)
    : options.workspaceStorage;
  let workspaces = readArtWorkspaces(workspaceStorage);
  const savedSnapshots = new Map<string, string>();
  const migratedIds = new Set(migration.migratedCompositionIds);
  for (const composition of sourceCompositions) {
    const hydrated = compositions.find((item) => item.id === composition.id);
    savedSnapshots.set(
      composition.id,
      artCompositionSnapshot(migratedIds.has(composition.id) || !hydrated ? composition : hydrated)
    );
  }
  const savedCompositionsDraftSnapshot = compositionsDraftSnapshot(compositions);
  synchronizeReferenceDimensions([...compositions, ...Object.values(workspaces)]);
  const sessionDraftPublisher = options.postDraft
    ? createSessionDraftPublisher({
        postDraft: options.postDraft,
        savedSnapshot: savedCompositionsDraftSnapshot,
        delayMs: options.draftPublishDelayMs,
        clearMessage: { clearArtCompositions: true },
        draftMessage: (snapshot) => ({ artCompositions: JSON.parse(snapshot) as ArtComposition[] })
      })
    : null;

  let selectedCompositionId = compositions[0]?.id || artWorkspaceId("stage");
  let selectedComponentIds = new Set<string>();
  type HistorySnapshot = {
    compositions: ArtComposition[];
    workspaces: Record<ArtWorkspaceSurface, ArtComposition>;
    selectedCompositionId: string;
    selectedComponentIds: string[];
  };
  const undoStack: HistorySnapshot[] = [];
  const redoStack: HistorySnapshot[] = [];
  let saving = false;
  let error: string | null = null;
  let cachedState = buildState();

  function selectedComposition(): ArtComposition | undefined {
    return compositions.find((composition) => composition.id === selectedCompositionId) ||
      Object.values(workspaces).find((composition) => composition.id === selectedCompositionId);
  }

  function referencedCompositionFor(composition: ArtComposition, preferredId = ""): ArtComposition | null {
    const candidates = compositions.filter((item) => item.id !== composition.id && !referenceWouldCreateCycle(composition.id, item.id));
    if (preferredId) return candidates.find((item) => item.id === preferredId) || null;
    const sameSurface = candidates.filter((item) => normalizeArtCompositionSurface(item.surface) === normalizeArtCompositionSurface(composition.surface));
    return (
      sameSurface.find((item) => normalizeArtCompositionKind(item.compositionKind) === "prefab") ||
      candidates.find((item) => normalizeArtCompositionKind(item.compositionKind) === "prefab") ||
      sameSurface[0] ||
      candidates[0] ||
      null
    );
  }

  function referenceWouldCreateCycle(ownerId: string, referencedId: string): boolean {
    const visit = (compositionId: string, visiting: Set<string>): boolean => {
      if (compositionId === ownerId) return true;
      if (visiting.has(compositionId)) return false;
      const composition = compositions.find((item) => item.id === compositionId);
      if (!composition) return false;
      const nextVisiting = new Set([...visiting, compositionId]);
      const stack = [...(composition.components || [])];
      while (stack.length) {
        const component = stack.pop();
        if (!component) continue;
        if (component.kind === "reference" && component.artCompositionId && visit(component.artCompositionId, nextVisiting)) return true;
        stack.push(...(component.children || []));
      }
      return false;
    };
    return Boolean(referencedId) && visit(referencedId, new Set());
  }

  function dirtyIds(): Set<string> {
    const ids = new Set<string>();
    for (const composition of compositions) {
      if (artCompositionSnapshot(composition) !== savedSnapshots.get(composition.id)) ids.add(composition.id);
    }
    return ids;
  }

  function deletedIds(): Set<string> {
    const currentIds = new Set(compositions.map((composition) => composition.id));
    return new Set([...savedSnapshots.keys()].filter((id) => !currentIds.has(id)));
  }

  function buildState(): ArtCompositionsEditorState {
    const dirtyCompositionIds = dirtyIds();
    return {
      compositions,
      workspaces,
      selectedCompositionId,
      selectedComponentIds: new Set(selectedComponentIds),
      dirtyCompositionIds,
      dirty: dirtyCompositionIds.size > 0 || deletedIds().size > 0,
      saving,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      error,
      migrationSummary: pendingMigrationSummary
    };
  }

  function emit(): void {
    cachedState = buildState();
    listeners.forEach((listener) => listener());
  }

  function scheduleDraft(): void {
    sessionDraftPublisher?.schedule(compositionsDraftSnapshot(compositions));
  }

  function snapshot(): HistorySnapshot {
    return {
      compositions: compositions.map((composition) => JSON.parse(JSON.stringify(composition)) as ArtComposition),
      workspaces: JSON.parse(JSON.stringify(workspaces)) as Record<ArtWorkspaceSurface, ArtComposition>,
      selectedCompositionId,
      selectedComponentIds: [...selectedComponentIds]
    };
  }

  function ensureSelectedComposition(): void {
    if (!selectedComposition()) {
      selectedCompositionId = artWorkspaceId("stage");
      selectedComponentIds = new Set();
      return;
    }
    const selected = selectedComposition();
    selectedComponentIds = new Set([...selectedComponentIds].filter((id) => Boolean(findComponent(selected?.components || [], id))));
  }

  function persistWorkspaces(): void {
    writeArtWorkspaces(workspaceStorage, workspaces);
  }

  function mutateAll(apply: () => void): void {
    if (pendingMigrationSummary) return;
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    apply();
    synchronizeReferenceDimensions([...compositions, ...Object.values(workspaces)]);
    compositions = compositions.slice();
    workspaces = { ...workspaces };
    ensureSelectedComposition();
    persistWorkspaces();
    emit();
    scheduleDraft();
  }

  /** Mutate the selected composition's component tree with history. */
  function mutateSelected(apply: (composition: ArtComposition) => void): void {
    const composition = selectedComposition();
    if (!composition) return;
    mutateAll(() => apply(composition));
  }

  return {
    getState: () => cachedState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    createComposition: (kind, surface, name) => {
      const next = createComposition(kind, surface, name, compositions);
      mutateAll(() => {
        compositions = [...compositions, next];
        selectedCompositionId = next.id;
        selectedComponentIds = new Set();
      });
      return next;
    },
    duplicateComposition: (compositionId) => {
      if (pendingMigrationSummary) return null;
      const sourceIndex = compositions.findIndex((composition) => composition.id === compositionId);
      const source = compositions[sourceIndex];
      if (!source) return null;
      const idMap = new Map<string, string>();
      const components = (source.components || []).map((component) => cloneComponentForPrefab(component, idMap));
      for (const component of components) applyClonedTimelineIds(component, idMap);
      const name = duplicateCompositionName(source.name, compositions);
      const kind = normalizeArtCompositionKind(source.compositionKind);
      const clonedSource = JSON.parse(JSON.stringify(source)) as ArtComposition;
      const next = hydrateArtCompositionForEditing({
        ...clonedSource,
        id: uniqueCompositionId(name, kind, compositions),
        name,
        isCustom: true,
        components,
        timeline: cloneTimelineWithIds(source.timeline, idMap)
      });
      mutateAll(() => {
        compositions = [...compositions.slice(0, sourceIndex + 1), next, ...compositions.slice(sourceIndex + 1)];
        selectedCompositionId = next.id;
        selectedComponentIds = new Set();
      });
      return next;
    },
    createPrefabFromComponents: (sourceCompositionId, componentIds, name) => {
      const source = compositions.find((composition) => composition.id === sourceCompositionId);
      const selected = selectedRootComponents(source?.components || [], new Set(componentIds));
      if (!source || selected.length === 0) return null;
      const { canvas, offsetX, offsetY } = canvasForComponents(selected);
      const idMap = new Map<string, string>();
      const cloned = selected.map((component) => cloneComponentForPrefab(component, idMap));
      const shifted = cloned.map((component) => {
        component.x = Number((Number(component.x || 0) + offsetX).toFixed(3));
        component.y = Number((Number(component.y || 0) + offsetY).toFixed(3));
        return applyClonedTimelineIds(component, idMap);
      });
      const next = {
        ...createComposition("prefab", source.surface, name, compositions),
        canvas,
        components: shifted
      };
      mutateAll(() => {
        compositions = [...compositions, hydrateArtCompositionForEditing(next)];
        selectedCompositionId = next.id;
        selectedComponentIds = new Set(shifted.map((component) => component.id));
      });
      return next;
    },
    convertSelectedComponentsToComposition: ({ name, kind = "prefab", frameOverrides = null }) => {
      if (pendingMigrationSummary) return null;
      const source = selectedComposition();
      if (!source || selectedComponentIds.size === 0) return null;
      const selectedRoots = selectedRootComponents(source.components || [], selectedComponentIds);
      if (!selectedRoots.length) return null;
      const firstGroup = findSiblingGroup(source.components || [], selectedRoots[0].id);
      if (!firstGroup || selectedRoots.some((component) => findSiblingGroup(source.components || [], component.id)?.siblings !== firstGroup.siblings)) {
        error = "Convert to prefab requires sibling layers in the same parent.";
        emit();
        return null;
      }
      const selectedIndexes = selectedRoots.map((component) => firstGroup.siblings.findIndex((item) => item.id === component.id)).sort((a, b) => a - b);
      if (selectedIndexes.some((index, position) => position > 0 && index !== selectedIndexes[position - 1] + 1)) {
        error = "Convert to prefab requires contiguous layers. Reorder the selected layers together first.";
        emit();
        return null;
      }
      if (firstGroup.owner && String(firstGroup.owner.childDistribution || "none") !== "none") {
        error = "Convert to prefab is not available inside an auto-distribution container yet.";
        emit();
        return null;
      }
      const commandTargets = new Set<string>();
      for (const component of selectedRoots) collectComponentTreeCommandTargets(component, commandTargets);
      const conflictingCommand = (source.timeline?.commands || []).find((command) =>
        (command.type === "playComponent" || command.type === "stopComponent") && commandTargetsSelection(command.target, commandTargets)
      );
      if (conflictingCommand) {
        error = `A timeline command targets ${String(conflictingCommand.target || "the selection")}. Update or remove that command before converting.`;
        emit();
        return null;
      }

      const displayedRoots = selectedRoots.map((component) => componentWithFrameOverrides(component, frameOverrides));
      const temporary: ArtComposition = {
        ...source,
        id: `${source.id}-selection-bounds`,
        canvas: { width: 1, height: 1 },
        components: displayedRoots
      };
      const compositionById = new Map(compositions.map((composition) => [composition.id, composition]));
      const selectionBounds = artCompositionContentBounds(temporary, compositionById);
      const idMap = new Map<string, string>();
      const cloned = displayedRoots.map((component) => cloneComponentForPrefab(component, idMap));
      const shifted = cloned.map((component) => {
        component.x = Number((Number(component.x || 0) - selectionBounds.minX).toFixed(3));
        component.y = Number((Number(component.y || 0) - selectionBounds.minY).toFixed(3));
        return applyClonedTimelineIds(component, idMap);
      });
      const cleanKind = normalizeArtCompositionKind(kind);
      const next = hydrateArtCompositionForEditing({
        ...createComposition(cleanKind, source.surface, name, compositions),
        canvas: {
          width: Number(selectionBounds.width.toFixed(3)),
          height: Number(selectionBounds.height.toFixed(3))
        },
        components: shifted
      });
      const reference = hydrateArtComponentForEditing({
        id: makeArtId("reference"),
        name: next.name,
        instanceLabel: uniqueInstanceLabelForComposition(source, next.name),
        kind: "reference",
        artCompositionId: next.id,
        x: Number((selectionBounds.minX + selectionBounds.width / 2).toFixed(3)),
        y: Number((selectionBounds.minY + selectionBounds.height / 2).toFixed(3)),
        width: Number(selectionBounds.width.toFixed(3)),
        height: Number(selectionBounds.height.toFixed(3)),
        scale: 1,
        rotation: 0,
        transformOrigin: "center",
        visible: true,
        editorHidden: false,
        locked: false,
        children: []
      } as ArtComponent);
      const removedIds = new Set<string>();
      for (const component of selectedRoots) collectComponentTreeIds(component, removedIds);
      mutateAll(() => {
        compositions = [...compositions, next];
        const nextSiblings = firstGroup.siblings.slice();
        nextSiblings.splice(selectedIndexes[0], selectedIndexes.length, reference);
        if (firstGroup.owner) firstGroup.owner.children = nextSiblings;
        else source.components = nextSiblings;
        Object.assign(source, removeTimelineTracksForIds(source, removedIds));
        selectedComponentIds = new Set([reference.id]);
        error = null;
      });
      return { composition: next, reference };
    },
    updateComposition: (compositionId, patch) => {
      const index = compositions.findIndex((composition) => composition.id === compositionId);
      const workspaceSurface = (Object.keys(workspaces) as ArtWorkspaceSurface[]).find((surface) => workspaces[surface].id === compositionId);
      if (index < 0 && !workspaceSurface) return;
      mutateAll(() => {
        const current = workspaceSurface ? workspaces[workspaceSurface] : compositions[index];
        const updated = hydrateArtCompositionForEditing({
          ...current,
          ...patch,
          id: current.id,
          name: cleanCompositionName(patch.name, current.name),
          surface: normalizeArtCompositionSurface(patch.surface || current.surface),
          compositionKind: normalizeArtCompositionKind(patch.compositionKind, normalizeArtCompositionKind(current.compositionKind)),
          canvas: patch.canvas || current.canvas,
          components: patch.components || current.components
        });
        if (workspaceSurface) {
          workspaces[workspaceSurface] = {
            ...updated,
            isArtWorkspace: true,
            timeline: patch.timeline === undefined ? current.timeline : patch.timeline
          };
        } else compositions[index] = updated;
      });
    },
    selectComposition: (compositionId) => {
      selectedCompositionId = compositionId;
      selectedComponentIds = new Set();
      emit();
    },
    selectWorkspace: (surface) => {
      selectedCompositionId = artWorkspaceId(surface);
      selectedComponentIds = new Set();
      emit();
    },
    selectComponent: (componentId, additive = false) => {
      if (additive) {
        if (selectedComponentIds.has(componentId)) selectedComponentIds.delete(componentId);
        else selectedComponentIds.add(componentId);
      } else {
        selectedComponentIds = new Set([componentId]);
      }
      emit();
    },
    selectComponents: (componentIds, additive = false) => {
      const nextIds = new Set(Array.from(componentIds).filter(Boolean));
      selectedComponentIds = additive ? new Set([...selectedComponentIds, ...nextIds]) : nextIds;
      emit();
    },
    clearComponentSelection: () => {
      selectedComponentIds = new Set();
      emit();
    },

    addComponent: (kind, options = {}) => {
      let created: ArtComponent | null = null;
      const selected = selectedComposition();
      if (
        selected &&
        normalizeCreatableComponentKind(kind) === "reference" &&
        options.referencedCompositionId &&
        referenceWouldCreateCycle(selected.id, options.referencedCompositionId)
      ) {
        error = `Prefab reference would create a cycle: ${selected.id} -> ${options.referencedCompositionId}`;
        emit();
        return null;
      }
      mutateSelected((composition) => {
        const requestedParentId = options.parentComponentId || [...selectedComponentIds][0];
        const requestedParent = requestedParentId ? findComponent(composition.components || [], requestedParentId) : undefined;
        const parent = requestedParent?.kind === "container" ? requestedParent : undefined;
        const bounds = parent
          ? { width: Number(parent.width || 1), height: Number(parent.height || 1) }
          : { width: Number(composition.canvas?.width || 560), height: Number(composition.canvas?.height || 230) };
        const reference =
          normalizeCreatableComponentKind(kind) === "reference"
            ? referencedCompositionFor(composition, options.referencedCompositionId)
            : null;
        const child = createComponent(kind, bounds, reference, compositions);
        if (Number.isFinite(options.x)) child.x = Number(Number(options.x).toFixed(3));
        if (Number.isFinite(options.y)) child.y = Number(Number(options.y).toFixed(3));
        if (parent) {
          parent.children = [...(parent.children || []), child];
        } else {
          composition.components = [...(composition.components || []), child];
        }
        assignUniqueArtInstanceLabels(composition.components);
        selectedComponentIds = new Set([child.id]);
        created = child;
      });
      return created;
    },
    removeSelectedComponents: () =>
      mutateSelected((composition) => {
        const removedIds = new Set<string>();
        composition.components = removeComponentsMatching(
          composition.components || [],
          (component) => selectedComponentIds.has(component.id),
          removedIds
        );
        Object.assign(composition, withoutRemovedTimelineTargets(composition, removedIds));
        selectedComponentIds = new Set();
      }),
    removeSelectedComposition: () => {
      const removedCompositionId = selectedCompositionId;
      if (!removedCompositionId || isArtWorkspaceId(removedCompositionId)) return;
      mutateAll(() => {
        compositions = compositions
          .filter((composition) => composition.id !== removedCompositionId)
          .map((composition) => {
            const removedIds = new Set<string>();
            const components = removeComponentsMatching(
              composition.components || [],
              (component) => component.kind === "reference" && component.artCompositionId === removedCompositionId,
              removedIds
            );
            return withoutRemovedTimelineTargets({ ...composition, components }, removedIds);
          });
        selectedComponentIds = new Set();
      });
    },
    updateComponent: (componentId, patch) =>
      mutateSelected((composition) => {
        const component = findComponent(composition.components || [], componentId);
        if (!component) return;
        if (Object.prototype.hasOwnProperty.call(patch, "instanceLabel")) {
          const requested = String(patch.instanceLabel || "").trim();
          const duplicate = (() => {
            const stack = [...(composition.components || [])];
            while (stack.length) {
              const candidate = stack.pop();
              if (!candidate) continue;
              if (candidate.id !== componentId && candidate.instanceLabel === requested) return true;
              stack.push(...(candidate.children || []));
            }
            return false;
          })();
          if (!validArtInstanceLabel(requested) || duplicate) {
            error = `Instance label must be a unique lower-camel identifier. Try ${suggestedArtInstanceLabel(component.name || component.id)}.`;
            return;
          }
          error = null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, "artCompositionId")) {
          if (referenceWouldCreateCycle(composition.id, String(patch.artCompositionId || ""))) {
            error = `Prefab reference would create a cycle: ${composition.id} -> ${String(patch.artCompositionId || "")}`;
            return;
          }
          const referenced = referencedCompositionFor(composition, String(patch.artCompositionId || ""));
          Object.assign(component, referenced ? referenceComponentPatch(referenced, compositions) : patch);
          error = null;
          return;
        }
        Object.assign(component, patch);
        Object.assign(component, hydrateArtComponentForEditing(component));
        error = null;
      }),
    swapReferenceGameObject: (componentId, compositionId) =>
      mutateSelected((composition) => {
        const component = findComponent(composition.components || [], componentId);
        if (!component || component.kind !== "reference") {
          error = "Select one referenced game object to swap.";
          return;
        }
        const referenced = compositions.find((item) => item.id === String(compositionId || ""));
        if (!referenced) {
          error = "Choose a game object or prefab from the library.";
          return;
        }
        if (normalizeArtCompositionSurface(referenced.surface) !== normalizeArtCompositionSurface(composition.surface)) {
          error = "The replacement game object must use the same surface.";
          return;
        }
        if (referenceWouldCreateCycle(composition.id, referenced.id)) {
          error = `Game object swap would create a cycle: ${composition.id} -> ${referenced.id}`;
          return;
        }
        component.artCompositionId = referenced.id;
        Object.assign(component, hydrateArtComponentForEditing(component));
        error = null;
      }),
    moveComponent: (componentId, x, y) =>
      mutateSelected((composition) => {
        const component = findComponent(composition.components || [], componentId);
        if (component) {
          (component as Record<string, unknown>).x = Number(x.toFixed(3));
          (component as Record<string, unknown>).y = Number(y.toFixed(3));
        }
      }),
    reorderComponent: (componentId, targetComponentId, placement) => {
      if (pendingMigrationSummary) return;
      const composition = selectedComposition();
      if (!composition) return;
      const sourceGroup = findSiblingGroup(composition.components || [], componentId);
      const targetGroup = findSiblingGroup(composition.components || [], targetComponentId);
      if (!sourceGroup || !targetGroup || sourceGroup.siblings !== targetGroup.siblings) return;
      const nextSiblings = reorderedSiblings(sourceGroup.siblings, componentId, targetComponentId, placement);
      if (!nextSiblings) return;
      undoStack.push(snapshot());
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
      if (sourceGroup.owner) sourceGroup.owner.children = nextSiblings;
      else composition.components = nextSiblings;
      persistWorkspaces();
      emit();
      scheduleDraft();
    },

    undo: () => {
      if (pendingMigrationSummary) return;
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(snapshot());
      compositions = previous.compositions;
      workspaces = previous.workspaces;
      selectedCompositionId = previous.selectedCompositionId;
      selectedComponentIds = new Set(previous.selectedComponentIds);
      ensureSelectedComposition();
      persistWorkspaces();
      emit();
      scheduleDraft();
    },
    redo: () => {
      if (pendingMigrationSummary) return;
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(snapshot());
      compositions = next.compositions;
      workspaces = next.workspaces;
      selectedCompositionId = next.selectedCompositionId;
      selectedComponentIds = new Set(next.selectedComponentIds);
      ensureSelectedComposition();
      persistWorkspaces();
      emit();
      scheduleDraft();
    },
    save: async () => {
      const dirty = dirtyIds();
      const deleted = deletedIds();
      if (!dirty.size && !deleted.size) {
        sessionDraftPublisher?.markSaved(compositionsDraftSnapshot(compositions));
        return true;
      }
      saving = true;
      error = null;
      emit();
      try {
        if (pendingMigrationSummary && api.saveArtCompositions) {
          const payloads = [...dirty]
            .map((id) => compositions.find((item) => item.id === id))
            .filter((composition): composition is ArtComposition => Boolean(composition))
            .map(serializeArtCompositionForSave);
          const response = await api.saveArtCompositions(payloads);
          for (const savedPayload of response.compositions) {
            const saved = hydrateArtCompositionForEditing(savedPayload);
            const index = compositions.findIndex((item) => item.id === saved.id);
            if (index >= 0) compositions[index] = saved;
            savedSnapshots.set(saved.id, artCompositionSnapshot(saved));
          }
          for (const id of deleted) {
            await api.deleteArtComposition(id);
            savedSnapshots.delete(id);
          }
          sessionDraftPublisher?.markSaved(compositionsDraftSnapshot(compositions));
          pendingMigrationSummary = null;
          saving = false;
          emit();
          return true;
        }
        for (const id of dirty) {
          const composition = compositions.find((item) => item.id === id);
          if (!composition) continue;
          const payload = serializeArtCompositionForSave(composition);
          const response = await api.saveArtComposition(id, payload);
          const saved = hydrateArtCompositionForEditing(response.composition || payload);
          const index = compositions.findIndex((item) => item.id === id);
          if (index >= 0) compositions[index] = saved;
          savedSnapshots.set(id, artCompositionSnapshot(saved));
        }
        for (const id of deleted) {
          await api.deleteArtComposition(id);
          savedSnapshots.delete(id);
        }
        compositions = compositions.slice();
        sessionDraftPublisher?.markSaved(compositionsDraftSnapshot(compositions));
        pendingMigrationSummary = null;
        saving = false;
        emit();
        return true;
      } catch (caught) {
        saving = false;
        error = caught instanceof Error ? caught.message : String(caught);
        emit();
        return false;
      }
    }
  };
}
