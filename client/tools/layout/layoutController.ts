import type { LayoutApi } from "../../api/layoutApi";
import { gameTextDefaultFontFamily } from "../../textFonts";
import type {
  ArtComposition,
  ControllerLayoutLayer,
  JsonObject,
  LayoutElement,
  LayoutState,
  StageLayoutCollection
} from "../../types/game-data";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import { requestLivePrototypeSave } from "../common/livePrototypeWorkspace";
import {
  layoutGroups,
  layoutSnapshot,
  normalizeLayoutAuthoringId,
  uniqueLayoutAuthoringId,
  type LayoutMode
} from "./layoutModel";

export interface LayoutEditorState {
  layouts: StageLayoutCollection;
  mode: LayoutMode;
  selectedGroupId: string;
  selectedElementIds: Set<string>;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
}

export interface LayoutControllerOptions {
  initialLayouts: StageLayoutCollection;
  mode: LayoutMode;
  api: LayoutApi;
  postDraft?: (message: JsonObject) => Promise<unknown>;
  draftPublishDelayMs?: number;
}

export interface LayoutController {
  getState(): LayoutEditorState;
  subscribe(listener: () => void): () => void;
  selectGroup(groupId: string): void;
  selectElement(elementId: string, additive?: boolean): void;
  clearElementSelection(): void;
  addTextElement(): void;
  addChoiceCollection(): string | null;
  addGameObject(composition: ArtComposition): string | null;
  addLayoutGroup(input: { id?: string; name: string }): string | null;
  addPersistentLayer(input: { id?: string; name: string; zIndex?: number }): string | null;
  updatePersistentLayer(layerId: string, patch: { name?: string; zIndex?: number }): void;
  setPersistentLayerVisible(stateId: string, layerId: string, visible: boolean): void;
  removeSelectedElements(): void;
  reorderElement(
    sourceElementId: string,
    targetElementId: string,
    placement: "before" | "after"
  ): void;
  updateElement(elementId: string, patch: Partial<LayoutElement>): void;
  moveElement(elementId: string, x: number, y: number): void;
  undo(): void;
  redo(): void;
  acceptWorkspaceSave(): void;
  save(): Promise<boolean>;
}

const HISTORY_LIMIT = 50;

export function createLayoutController(options: LayoutControllerOptions): LayoutController {
  const { api, mode } = options;
  const listeners = new Set<() => void>();
  let layouts = JSON.parse(JSON.stringify(options.initialLayouts)) as StageLayoutCollection;
  let savedSnapshot = layoutSnapshot(layouts, mode);
  const sessionDraftPublisher = options.postDraft
    ? createSessionDraftPublisher({
        postDraft: options.postDraft,
        savedSnapshot,
        delayMs: options.draftPublishDelayMs,
        clearMessage: mode === "stage" ? { clearLayouts: true } : { clearControllerLayouts: true },
        draftMessage: (snapshotText) =>
          mode === "stage"
            ? { layouts: JSON.parse(snapshotText) as StageLayoutCollection }
            : { controllerLayouts: JSON.parse(snapshotText) as StageLayoutCollection }
      })
    : null;
  let selectedGroupId = layouts.global?.id || "global";
  let selectedElementIds = new Set<string>();
  const undoStack: StageLayoutCollection[] = [];
  const redoStack: StageLayoutCollection[] = [];
  let saving = false;
  let error: string | null = null;
  let cachedState = buildState();

  function group(): LayoutState | undefined {
    return layoutGroups(layouts).find((item) => item.id === selectedGroupId);
  }

  function buildState(): LayoutEditorState {
    return {
      layouts,
      mode,
      selectedGroupId,
      selectedElementIds: new Set(selectedElementIds),
      dirty: layoutSnapshot(layouts, mode) !== savedSnapshot,
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
    sessionDraftPublisher?.schedule(layoutSnapshot(layouts, mode));
  }

  function snapshot(): StageLayoutCollection {
    return JSON.parse(JSON.stringify(layouts)) as StageLayoutCollection;
  }

  function recordMutation(apply: () => void): void {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    apply();
    emit();
    scheduleDraft();
  }

  function mutateGroup(apply: (group: LayoutState) => void): void {
    const target = group();
    if (!target) return;
    recordMutation(() => apply(target));
  }

  function reconcileSelection(): void {
    const selectedGroup = group();
    if (!selectedGroup) {
      selectedGroupId = layouts.global?.id || "global";
      selectedElementIds = new Set();
      return;
    }
    const elementIds = new Set((selectedGroup.elements || []).map((element) => element.id));
    selectedElementIds = new Set([...selectedElementIds].filter((id) => elementIds.has(id)));
  }

  return {
    getState: () => cachedState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    selectGroup: (groupId) => {
      selectedGroupId = groupId;
      selectedElementIds = new Set();
      emit();
    },
    selectElement: (elementId, additive = false) => {
      if (additive) {
        if (selectedElementIds.has(elementId)) selectedElementIds.delete(elementId);
        else selectedElementIds.add(elementId);
      } else {
        selectedElementIds = new Set([elementId]);
      }
      emit();
    },
    clearElementSelection: () => {
      selectedElementIds = new Set();
      emit();
    },

    addTextElement: () =>
      mutateGroup((target) => {
        const usedIds = (target.elements || []).map((element) => element.id);
        const element = {
          id: uniqueLayoutAuthoringId(
            "layout-text-field-instance",
            usedIds,
            "layout-text-field-instance"
          ),
          name: "Text",
          kind: "text",
          artCompositionId: "layout-text-field",
          x: 200,
          y: 200,
          width: 400,
          height: 120,
          scale: 1,
          rotation: 0,
          defaultText: "Text",
          fontSize: 58,
          fontColor: "#ffffff",
          fontFamily: gameTextDefaultFontFamily,
          autoFitText: false
        } as unknown as LayoutElement;
        target.elements = [...(target.elements || []), element];
        selectedElementIds = new Set([element.id]);
      }),
    addChoiceCollection: () => {
      if (mode !== "controller") {
        error = "Dynamic choice collections are available only on Controller Layouts.";
        emit();
        return null;
      }
      const target = group();
      if (!target) return null;
      const elementId = uniqueLayoutAuthoringId(
        "choice-collection",
        (target.elements || []).map((element) => element.id),
        "choice-collection"
      );
      recordMutation(() => {
        const element: LayoutElement = {
          id: elementId,
          name: "Choice Collection",
          selector: "",
          kind: "collection",
          artCompositionId: "",
          hidden: false,
          locked: false,
          x: Number(layouts.canvas?.width || 390) / 2,
          y: Number(layouts.canvas?.height || 844) / 2,
          width: 330,
          height: 500,
          scale: 1,
          rotation: 0,
          tags: [],
          defaultAnimationState: "On",
          collectionDirection: "vertical",
          collectionGap: 16,
          collectionDistribution: "start",
          collectionAlignment: "stretch",
          collectionPadding: 0,
          collectionOverflow: "auto",
          zIndex: 0
        };
        target.elements = [...(target.elements || []), element];
        selectedElementIds = new Set([element.id]);
        error = null;
      });
      return elementId;
    },
    addGameObject: (composition) => {
      const target = group();
      const compositionId = normalizeLayoutAuthoringId(composition?.id);
      const compositionSurface = String(composition?.surface || "")
        .trim()
        .toLowerCase();
      const compositionKind = String(composition?.compositionKind || "gameObject")
        .trim()
        .toLowerCase();
      const width = Number(composition?.canvas?.width || 0);
      const height = Number(composition?.canvas?.height || 0);
      if (
        !target ||
        !compositionId ||
        compositionSurface !== mode ||
        compositionKind !== "gameobject" ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        error = "Choose a valid Art Manager Game Object for this layout surface.";
        emit();
        return null;
      }
      const elementId = uniqueLayoutAuthoringId(
        `${compositionId}-instance`,
        (target.elements || []).map((element) => element.id),
        "game-object-instance"
      );
      recordMutation(() => {
        const element = {
          id: elementId,
          name: String(composition.name || composition.id || "Game Object"),
          selector: "",
          kind: "art",
          artCompositionId: compositionId,
          layoutLayer: "content",
          hidden: false,
          locked: false,
          x: Number(layouts.canvas?.width || (mode === "controller" ? 390 : 1920)) / 2,
          y: Number(layouts.canvas?.height || (mode === "controller" ? 844 : 1080)) / 2,
          width,
          height,
          scale: 1,
          rotation: 0,
          tags: [],
          defaultAnimationState: mode === "controller" ? "On" : ""
        } as LayoutElement;
        target.elements = [...(target.elements || []), element];
        selectedElementIds = new Set([element.id]);
        error = null;
      });
      return elementId;
    },
    addLayoutGroup: (input) => {
      if (mode !== "controller") {
        error = "Stage layout groups are created by the Flow Tool.";
        emit();
        return null;
      }
      const name =
        String(input?.name || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 240) || "New Controller Layout";
      const groupId = uniqueLayoutAuthoringId(
        input?.id || name,
        layoutGroups(layouts).map((item) => item.id),
        "controller-layout"
      );
      recordMutation(() => {
        const nextGroup = {
          id: groupId,
          name,
          hiddenInStates: false,
          hiddenGlobals: [],
          elements: []
        } as LayoutState;
        layouts.states = [...(layouts.states || []), nextGroup];
        selectedGroupId = groupId;
        selectedElementIds = new Set();
        error = null;
      });
      return groupId;
    },
    addPersistentLayer: (input) => {
      if (mode !== "controller") {
        error = "Persistent layers are available only on Controller Layouts.";
        emit();
        return null;
      }
      const name = String(input?.name || "").trim().replace(/\s+/g, " ").slice(0, 240) || "Persistent Layer";
      const layerId = uniqueLayoutAuthoringId(
        input?.id || name,
        layoutGroups(layouts).map((item) => item.id),
        "persistent-layer"
      );
      const existingZ = (layouts.layers || []).map((layer) => Number(layer.zIndex || 0));
      const zIndex = Number.isFinite(Number(input.zIndex))
        ? Number(input.zIndex)
        : Math.max(0, ...existingZ) + 100;
      recordMutation(() => {
        const layer: ControllerLayoutLayer = { id: layerId, name, zIndex, elements: [] };
        layouts.layers = [...(layouts.layers || []), layer];
        selectedGroupId = layerId;
        selectedElementIds = new Set();
        error = null;
      });
      return layerId;
    },
    updatePersistentLayer: (layerId, patch) => {
      const layer = (layouts.layers || []).find((item) => item.id === layerId);
      if (!layer) return;
      recordMutation(() => {
        if (patch.name !== undefined) layer.name = String(patch.name).trim().slice(0, 240) || layer.name;
        if (patch.zIndex !== undefined && Number.isFinite(Number(patch.zIndex))) layer.zIndex = Number(patch.zIndex);
      });
    },
    setPersistentLayerVisible: (stateId, layerId, visible) => {
      const state = (layouts.states || []).find((item) => item.id === stateId);
      if (!state || !(layouts.layers || []).some((layer) => layer.id === layerId)) return;
      recordMutation(() => {
        const hidden = new Set(state.hiddenLayers || []);
        if (visible) hidden.delete(layerId);
        else hidden.add(layerId);
        state.hiddenLayers = [...hidden];
      });
    },
    removeSelectedElements: () =>
      mutateGroup((target) => {
        target.elements = (target.elements || []).filter(
          (element) => !selectedElementIds.has(element.id)
        );
        selectedElementIds = new Set();
      }),
    reorderElement: (sourceElementId, targetElementId, placement) =>
      mutateGroup((target) => {
        if (!sourceElementId || !targetElementId || sourceElementId === targetElementId) return;
        const elements = [...(target.elements || [])];
        const sourceIndex = elements.findIndex((element) => element.id === sourceElementId);
        const targetIndex = elements.findIndex((element) => element.id === targetElementId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [source] = elements.splice(sourceIndex, 1);
        const adjustedTargetIndex = elements.findIndex((element) => element.id === targetElementId);
        const insertIndex = placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
        elements.splice(Math.max(0, insertIndex), 0, source);
        target.elements = elements;
      }),
    updateElement: (elementId, patch) =>
      mutateGroup((target) => {
        const element = (target.elements || []).find((item) => item.id === elementId);
        if (element) Object.assign(element, patch);
      }),
    moveElement: (elementId, x, y) =>
      mutateGroup((target) => {
        const element = (target.elements || []).find((item) => item.id === elementId);
        if (element) {
          (element as Record<string, unknown>).x = Number(x.toFixed(3));
          (element as Record<string, unknown>).y = Number(y.toFixed(3));
        }
      }),

    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(snapshot());
      layouts = previous;
      reconcileSelection();
      emit();
      scheduleDraft();
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(snapshot());
      layouts = next;
      reconcileSelection();
      emit();
      scheduleDraft();
    },
    acceptWorkspaceSave: () => {
      savedSnapshot = layoutSnapshot(layouts, mode);
      sessionDraftPublisher?.markSaved(savedSnapshot);
      error = null;
      emit();
    },
    save: async () => {
      if (requestLivePrototypeSave()) return true;
      saving = true;
      error = null;
      emit();
      try {
        const response =
          mode === "stage"
            ? await api.saveStageLayouts(layouts)
            : await api.saveControllerLayouts(layouts);
        layouts = (response.layouts || layouts) as StageLayoutCollection;
        savedSnapshot = layoutSnapshot(layouts, mode);
        sessionDraftPublisher?.markSaved(savedSnapshot);
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
