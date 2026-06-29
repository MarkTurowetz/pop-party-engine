import type { HostAudioLine, HostAudios } from "../../types/game-data";
import type { HostAudioApi } from "../../api/hostAudioApi";
import { hostAudiosSnapshot, makeHostAudioReferenceId, normalizeHostAudios } from "./hostAudioModel";

export interface HostAudioEditorState {
  hostAudios: HostAudios;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
}

export interface HostAudioControllerOptions {
  initialHostAudios: HostAudios;
  api: HostAudioApi;
}

export interface HostAudioController {
  getState(): HostAudioEditorState;
  subscribe(listener: () => void): () => void;
  addSet(): void;
  removeSet(index: number): void;
  renameSet(index: number, name: string): void;
  addLine(setIndex: number): void;
  removeLine(setIndex: number, lineIndex: number): void;
  updateLine(setIndex: number, lineIndex: number, patch: Partial<Pick<HostAudioLine, "text" | "url">>): void;
  undo(): void;
  redo(): void;
  revert(): void;
  save(): Promise<HostAudios | null>;
}

const HISTORY_LIMIT = 50;

function clone(value: HostAudios): HostAudios {
  return normalizeHostAudios(JSON.parse(JSON.stringify(value)) as HostAudios);
}

export function createHostAudioController(options: HostAudioControllerOptions): HostAudioController {
  const { api } = options;
  const listeners = new Set<() => void>();
  let current = normalizeHostAudios(options.initialHostAudios);
  let savedSnapshot = hostAudiosSnapshot(current);
  const undoStack: HostAudios[] = [];
  const redoStack: HostAudios[] = [];
  let saving = false;
  let error: string | null = null;
  let cachedState = buildState();

  function buildState(): HostAudioEditorState {
    return {
      hostAudios: current,
      dirty: hostAudiosSnapshot(current) !== savedSnapshot,
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

  function mutate(apply: (draft: HostAudios) => void): void {
    const draft = clone(current);
    apply(draft);
    undoStack.push(current);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    current = normalizeHostAudios(draft);
    emit();
  }

  return {
    getState: () => cachedState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    addSet: () =>
      mutate((draft) => {
        const n = draft.hostAudios.length + 1;
        draft.hostAudios = [...draft.hostAudios, { id: `host-audio-${n}`, name: `Host Audio ${n}`, lines: [] }];
      }),
    removeSet: (index) =>
      mutate((draft) => {
        draft.hostAudios = draft.hostAudios.filter((_, i) => i !== index);
      }),
    renameSet: (index, name) =>
      mutate((draft) => {
        if (draft.hostAudios[index]) draft.hostAudios[index] = { ...draft.hostAudios[index], name };
      }),
    addLine: (setIndex) =>
      mutate((draft) => {
        const set = draft.hostAudios[setIndex];
        if (!set) return;
        set.lines = [...set.lines, { id: makeHostAudioReferenceId("host-line"), text: "", url: "" }];
      }),
    removeLine: (setIndex, lineIndex) =>
      mutate((draft) => {
        const set = draft.hostAudios[setIndex];
        if (!set) return;
        set.lines = set.lines.filter((_, i) => i !== lineIndex);
      }),
    updateLine: (setIndex, lineIndex, patch) =>
      mutate((draft) => {
        const set = draft.hostAudios[setIndex];
        if (!set || !set.lines[lineIndex]) return;
        set.lines[lineIndex] = { ...set.lines[lineIndex], ...patch };
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
      current = normalizeHostAudios(JSON.parse(savedSnapshot) as HostAudios);
      emit();
    },
    save: async () => {
      saving = true;
      error = null;
      emit();
      try {
        const response = await api.saveHostAudios(current);
        const saved = normalizeHostAudios(response.hostAudios || current);
        current = saved;
        savedSnapshot = hostAudiosSnapshot(saved);
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
