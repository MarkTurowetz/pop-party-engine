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
import { mergeDefaultArtVisibilityTimeline } from "./artTimelineModel";
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
}

export interface ArtCompositionsController {
  getState(): ArtCompositionsEditorState;
  subscribe(listener: () => void): () => void;
  createComposition(kind: ArtCompositionKind, surface: string, name?: string): ArtComposition;
  createPrefabFromComponents(sourceCompositionId: string, componentIds: Iterable<string>, name: string): ArtComposition | null;
  updateComposition(compositionId: string, patch: Partial<ArtComposition>): void;
  selectComposition(compositionId: string): void;
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

function referenceComponentPatch(composition: ArtComposition): Partial<ArtComponent> {
  return {
    name: composition.name,
    width: Number(composition.canvas?.width || DEFAULT_COMPOSITION_CANVAS.width),
    height: Number(composition.canvas?.height || DEFAULT_COMPOSITION_CANVAS.height),
    artCompositionId: composition.id
  };
}

function createComponent(kind: string, bounds: { width: number; height: number }, referencedComposition: ArtComposition | null = null): ArtComponent {
  const cleanKind = normalizeCreatableComponentKind(kind);
  const referencePatch = cleanKind === "reference" && referencedComposition ? referenceComponentPatch(referencedComposition) : null;
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
  const migration = migrateArtTimelineArchitecture(sourceCompositions);
  let pendingMigrationSummary = migration.migratedCompositionIds.length
    ? {
        compositionCount: migration.migratedCompositionIds.length,
        removedTrackCount: migration.removedTrackCount,
        removedKeyframeCount: migration.removedKeyframeCount,
        removedComponentTimelineCount: migration.removedComponentTimelineCount
      }
    : null;
  let compositions = hydrateArtCompositionsForEditing(migration.compositions);
  const savedSnapshots = new Map<string, string>();
  const migratedIds = new Set(migration.migratedCompositionIds);
  for (const composition of sourceCompositions) {
    const hydrated = compositions.find((item) => item.id === composition.id);
    savedSnapshots.set(
      composition.id,
      artCompositionSnapshot(migratedIds.has(composition.id) || !hydrated ? composition : hydrated)
    );
  }
  const sessionDraftPublisher = options.postDraft
    ? createSessionDraftPublisher({
        postDraft: options.postDraft,
        savedSnapshot: compositionsDraftSnapshot(compositions),
        delayMs: options.draftPublishDelayMs,
        clearMessage: { clearArtCompositions: true },
        draftMessage: (snapshot) => ({ artCompositions: JSON.parse(snapshot) as ArtComposition[] })
      })
    : null;

  let selectedCompositionId = compositions[0]?.id || "";
  let selectedComponentIds = new Set<string>();
  const undoStack: ArtComposition[][] = [];
  const redoStack: ArtComposition[][] = [];
  let saving = false;
  let error: string | null = null;
  let cachedState = buildState();

  function selectedComposition(): ArtComposition | undefined {
    return compositions.find((composition) => composition.id === selectedCompositionId);
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

  function snapshot(): ArtComposition[] {
    return compositions.map((composition) => JSON.parse(JSON.stringify(composition)) as ArtComposition);
  }

  function ensureSelectedComposition(): void {
    if (!compositions.some((composition) => composition.id === selectedCompositionId)) {
      selectedCompositionId = compositions[0]?.id || "";
      selectedComponentIds = new Set();
    }
  }

  function mutateAll(apply: () => void): void {
    if (pendingMigrationSummary) return;
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    apply();
    ensureSelectedComposition();
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
    updateComposition: (compositionId, patch) => {
      const index = compositions.findIndex((composition) => composition.id === compositionId);
      if (index < 0) return;
      mutateAll(() => {
        const current = compositions[index];
        compositions[index] = hydrateArtCompositionForEditing({
          ...current,
          ...patch,
          id: current.id,
          name: cleanCompositionName(patch.name, current.name),
          surface: normalizeArtCompositionSurface(patch.surface || current.surface),
          compositionKind: normalizeArtCompositionKind(patch.compositionKind, normalizeArtCompositionKind(current.compositionKind)),
          canvas: patch.canvas || current.canvas,
          components: patch.components || current.components
        });
      });
    },
    selectComposition: (compositionId) => {
      selectedCompositionId = compositionId;
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
        const parentId = options.parentComponentId || [...selectedComponentIds][0];
        const parent = parentId ? findComponent(composition.components || [], parentId) : undefined;
        const bounds = parent
          ? { width: Number(parent.width || 1), height: Number(parent.height || 1) }
          : { width: Number(composition.canvas?.width || 560), height: Number(composition.canvas?.height || 230) };
        const reference =
          normalizeCreatableComponentKind(kind) === "reference"
            ? referencedCompositionFor(composition, options.referencedCompositionId)
            : null;
        const child = createComponent(kind, bounds, reference);
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
      if (!removedCompositionId) return;
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
          Object.assign(component, referenced ? referenceComponentPatch(referenced) : patch);
          return;
        }
        Object.assign(component, patch);
        Object.assign(component, hydrateArtComponentForEditing(component));
      }),
    swapReferenceGameObject: (componentId, compositionId) =>
      mutateSelected((composition) => {
        const component = findComponent(composition.components || [], componentId);
        if (!component || component.kind !== "reference") {
          error = "Select one referenced game object to swap.";
          return;
        }
        const referenced = compositions.find((item) => item.id === String(compositionId || ""));
        if (!referenced || normalizeArtCompositionKind(referenced.compositionKind) !== "gameObject") {
          error = "Choose a game object from the library.";
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
      emit();
      scheduleDraft();
    },

    undo: () => {
      if (pendingMigrationSummary) return;
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(snapshot());
      compositions = previous;
      ensureSelectedComposition();
      emit();
      scheduleDraft();
    },
    redo: () => {
      if (pendingMigrationSummary) return;
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(snapshot());
      compositions = next;
      ensureSelectedComposition();
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
