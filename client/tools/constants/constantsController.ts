import type { GameConstants } from "../../types/game-data";
import type { ConstantsApi } from "../../api/constantsApi";
import {
  constantsSnapshot,
  normalizeCustomConstantType,
  normalizeGameConstants,
  type CustomConstant,
  type CustomConstantType,
  type NormalizedGameConstants
} from "./constantsModel";

/**
 * Framework-agnostic controller for the React constants editor. Owns a normalized
 * GameConstants object with undo/redo history, and saves through the typed
 * ConstantsApi. Dirty tracking matches the legacy tool (JSON of the normalized
 * constants vs the last saved snapshot) so saved JSON stays byte-compatible.
 */
export interface ConstantsEditorState {
  constants: NormalizedGameConstants;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
}

export interface ConstantsControllerOptions {
  initialConstants: GameConstants;
  api: ConstantsApi;
}

export interface ConstantsController {
  getState(): ConstantsEditorState;
  subscribe(listener: () => void): () => void;
  setConstant(key: keyof NormalizedGameConstants, value: unknown): void;
  setPlayerColor(index: number, color: string): void;
  addPlayerColor(): void;
  removePlayerColor(index: number): void;
  addCustomConstant(): void;
  removeCustomConstant(index: number): void;
  updateCustomConstant(index: number, patch: Partial<CustomConstant>): void;
  undo(): void;
  redo(): void;
  revert(): void;
  save(): Promise<GameConstants | null>;
}

const HISTORY_LIMIT = 50;

function clone(constants: NormalizedGameConstants): NormalizedGameConstants {
  return normalizeGameConstants(JSON.parse(JSON.stringify(constants)) as GameConstants);
}

export function createConstantsController(options: ConstantsControllerOptions): ConstantsController {
  const { api } = options;
  const listeners = new Set<() => void>();
  let current = normalizeGameConstants(options.initialConstants);
  let savedSnapshot = constantsSnapshot(current);
  const undoStack: NormalizedGameConstants[] = [];
  const redoStack: NormalizedGameConstants[] = [];
  let saving = false;
  let error: string | null = null;

  // useSyncExternalStore requires a cached snapshot — rebuild it only on change.
  let cachedState: ConstantsEditorState = buildState();

  function buildState(): ConstantsEditorState {
    return {
      constants: current,
      dirty: constantsSnapshot(current) !== savedSnapshot,
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

  function getState(): ConstantsEditorState {
    return cachedState;
  }

  /** Apply a mutation to a draft, normalize, push history, and emit. */
  function mutate(apply: (draft: NormalizedGameConstants) => void): void {
    const draft = clone(current);
    apply(draft);
    const next = normalizeGameConstants(draft);
    undoStack.push(current);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    current = next;
    emit();
  }

  return {
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setConstant: (key, value) =>
      mutate((draft) => {
        (draft as Record<string, unknown>)[key as string] = value;
      }),
    setPlayerColor: (index, color) =>
      mutate((draft) => {
        if (index >= 0 && index < draft.playerColors.length) draft.playerColors[index] = color;
      }),
    addPlayerColor: () =>
      mutate((draft) => {
        draft.playerColors = [...draft.playerColors, "#ffffff"];
      }),
    removePlayerColor: (index) =>
      mutate((draft) => {
        draft.playerColors = draft.playerColors.filter((_, i) => i !== index);
      }),
    addCustomConstant: () =>
      mutate((draft) => {
        const nextNumber = draft.customConstants.length + 1;
        draft.customConstants = [
          ...draft.customConstants,
          { id: `customConstant${nextNumber}`, name: `Custom Constant ${nextNumber}`, type: "string", value: "" }
        ];
      }),
    removeCustomConstant: (index) =>
      mutate((draft) => {
        draft.customConstants = draft.customConstants.filter((_, i) => i !== index);
      }),
    updateCustomConstant: (index, patch) =>
      mutate((draft) => {
        const existing = draft.customConstants[index];
        if (!existing) return;
        const type: CustomConstantType = patch.type ? normalizeCustomConstantType(patch.type) : existing.type;
        draft.customConstants[index] = { ...existing, ...patch, type };
      }),

    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(current);
      current = previous;
      emit();
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(current);
      current = next;
      emit();
    },
    revert: () => {
      undoStack.push(current);
      redoStack.length = 0;
      current = normalizeGameConstants(JSON.parse(savedSnapshot) as GameConstants);
      emit();
    },
    save: async () => {
      saving = true;
      error = null;
      emit();
      try {
        const response = await api.saveGameConstants(current);
        const saved = normalizeGameConstants(response.constants || current);
        current = saved;
        savedSnapshot = constantsSnapshot(saved);
        saving = false;
        emit();
        return saved;
      } catch (caught) {
        saving = false;
        error = caught instanceof Error ? caught.message : String(caught);
        emit();
        return null;
      }
    }
  };
}
