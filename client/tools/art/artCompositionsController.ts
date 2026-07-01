import type { ArtApi } from "../../api/artApi";
import type { ArtComponent, ArtComposition, JsonObject } from "../../types/game-data";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import { artCompositionSnapshot, serializeArtCompositionForSave } from "./artCompositionModel";
import { componentKindLabel, normalizeCreatableComponentKind } from "./artComponentSchema";

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
  selectComposition(compositionId: string): void;
  selectComponent(componentId: string, additive?: boolean): void;
  clearComponentSelection(): void;
  addComponent(kind: string): void;
  removeSelectedComponents(): void;
  updateComponent(componentId: string, patch: Partial<ArtComponent>): void;
  moveComponent(componentId: string, x: number, y: number): void;
  undo(): void;
  redo(): void;
  save(): Promise<boolean>;
}

const HISTORY_LIMIT = 50;

function makeArtId(kind: string): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  const token = cryptoObj?.randomUUID ? cryptoObj.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${kind}-${token}`;
}

function createComponent(kind: string, bounds: { width: number; height: number }): ArtComponent {
  const cleanKind = normalizeCreatableComponentKind(kind);
  const width = cleanKind === "text" ? 220 : cleanKind === "container" ? 320 : 180;
  const height = cleanKind === "text" ? 60 : cleanKind === "container" ? 140 : 96;
  const component: Record<string, unknown> = {
    id: makeArtId(cleanKind),
    name: componentKindLabel(cleanKind),
    kind: cleanKind,
    x: Number(bounds.width || 560) / 2,
    y: Number(bounds.height || 230) / 2,
    width,
    height,
    scale: 1,
    rotation: 0,
    children: []
  };
  if (cleanKind === "text") {
    component.defaultText = "TEXT";
    component.fontSize = 48;
    component.autoFitText = false;
    component.fontColor = "#17131f";
  }
  return component as ArtComponent;
}

function findComponent(components: ArtComponent[], id: string): ArtComponent | undefined {
  for (const component of components) {
    if (component.id === id) return component;
    const found = component.children ? findComponent(component.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

function removeFromList(components: ArtComponent[], ids: Set<string>): ArtComponent[] {
  return components
    .filter((component) => !ids.has(component.id))
    .map((component) => ({
      ...component,
      children: component.children ? removeFromList(component.children, ids) : component.children
    }));
}

function compositionsDraftSnapshot(compositions: ArtComposition[]): string {
  return JSON.stringify(compositions.map((composition) => serializeArtCompositionForSave(composition)));
}

export function createArtCompositionsController(
  options: ArtCompositionsControllerOptions
): ArtCompositionsController {
  const { api } = options;
  const listeners = new Set<() => void>();
  let compositions = (options.initialCompositions || []).map(
    (composition) => JSON.parse(JSON.stringify(composition)) as ArtComposition
  );
  const savedSnapshots = new Map<string, string>();
  for (const composition of compositions) savedSnapshots.set(composition.id, artCompositionSnapshot(composition));
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

  function dirtyIds(): Set<string> {
    const ids = new Set<string>();
    for (const composition of compositions) {
      if (artCompositionSnapshot(composition) !== savedSnapshots.get(composition.id)) ids.add(composition.id);
    }
    return ids;
  }

  function buildState(): ArtCompositionsEditorState {
    const dirtyCompositionIds = dirtyIds();
    return {
      compositions,
      selectedCompositionId,
      selectedComponentIds: new Set(selectedComponentIds),
      dirtyCompositionIds,
      dirty: dirtyCompositionIds.size > 0,
      saving,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      error
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

  /** Mutate the selected composition's component tree with history. */
  function mutateSelected(apply: (composition: ArtComposition) => void): void {
    const composition = selectedComposition();
    if (!composition) return;
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    apply(composition);
    emit();
    scheduleDraft();
  }

  return {
    getState: () => cachedState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
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
    clearComponentSelection: () => {
      selectedComponentIds = new Set();
      emit();
    },

    addComponent: (kind) =>
      mutateSelected((composition) => {
        const parentId = [...selectedComponentIds][0];
        const parent = parentId ? findComponent(composition.components || [], parentId) : undefined;
        const bounds = parent
          ? { width: Number(parent.width || 1), height: Number(parent.height || 1) }
          : { width: Number(composition.canvas?.width || 560), height: Number(composition.canvas?.height || 230) };
        const child = createComponent(kind, bounds);
        if (parent && (parent.kind === "container")) {
          parent.children = [...(parent.children || []), child];
        } else {
          composition.components = [...(composition.components || []), child];
        }
        selectedComponentIds = new Set([child.id]);
      }),
    removeSelectedComponents: () =>
      mutateSelected((composition) => {
        composition.components = removeFromList(composition.components || [], selectedComponentIds);
        selectedComponentIds = new Set();
      }),
    updateComponent: (componentId, patch) =>
      mutateSelected((composition) => {
        const component = findComponent(composition.components || [], componentId);
        if (component) Object.assign(component, patch);
      }),
    moveComponent: (componentId, x, y) =>
      mutateSelected((composition) => {
        const component = findComponent(composition.components || [], componentId);
        if (component) {
          (component as Record<string, unknown>).x = Number(x.toFixed(3));
          (component as Record<string, unknown>).y = Number(y.toFixed(3));
        }
      }),

    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(snapshot());
      compositions = previous;
      emit();
      scheduleDraft();
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(snapshot());
      compositions = next;
      emit();
      scheduleDraft();
    },
    save: async () => {
      const dirty = dirtyIds();
      if (!dirty.size) {
        sessionDraftPublisher?.markSaved(compositionsDraftSnapshot(compositions));
        return true;
      }
      saving = true;
      error = null;
      emit();
      try {
        for (const id of dirty) {
          const composition = compositions.find((item) => item.id === id);
          if (!composition) continue;
          const payload = serializeArtCompositionForSave(composition);
          const response = await api.saveArtComposition(id, payload);
          const saved = response.composition || payload;
          const index = compositions.findIndex((item) => item.id === id);
          if (index >= 0) compositions[index] = saved;
          savedSnapshots.set(id, artCompositionSnapshot(saved));
        }
        sessionDraftPublisher?.markSaved(compositionsDraftSnapshot(compositions));
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
