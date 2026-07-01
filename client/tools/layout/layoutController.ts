import type { LayoutApi } from "../../api/layoutApi";
import type { JsonObject, LayoutElement, LayoutState, StageLayoutCollection } from "../../types/game-data";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import { layoutGroups, layoutSnapshot, type LayoutMode } from "./layoutModel";

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
  removeSelectedElements(): void;
  updateElement(elementId: string, patch: Partial<LayoutElement>): void;
  moveElement(elementId: string, x: number, y: number): void;
  undo(): void;
  redo(): void;
  save(): Promise<boolean>;
}

const HISTORY_LIMIT = 50;

function makeId(prefix: string): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  const token = cryptoObj?.randomUUID ? cryptoObj.randomUUID().replace(/-/g, "").slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${token}`;
}

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

  function mutateGroup(apply: (group: LayoutState) => void): void {
    const target = group();
    if (!target) return;
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    apply(target);
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
        const element = {
          id: makeId("text"),
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
          fontColor: "#ffffff"
        } as unknown as LayoutElement;
        target.elements = [...(target.elements || []), element];
        selectedElementIds = new Set([element.id]);
      }),
    removeSelectedElements: () =>
      mutateGroup((target) => {
        target.elements = (target.elements || []).filter((element) => !selectedElementIds.has(element.id));
        selectedElementIds = new Set();
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
      emit();
      scheduleDraft();
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(snapshot());
      layouts = next;
      emit();
      scheduleDraft();
    },
    save: async () => {
      saving = true;
      error = null;
      emit();
      try {
        const response =
          mode === "stage" ? await api.saveStageLayouts(layouts) : await api.saveControllerLayouts(layouts);
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
