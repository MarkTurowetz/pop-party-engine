import type { HostAudioLine, HostAudios, JsonObject } from "../../types/game-data";
import type { HostAudioApi } from "../../api/hostAudioApi";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import { requestLivePrototypeSave } from "../common/livePrototypeWorkspace";
import {
  hostAudiosSnapshot,
  makeHostAudioReferenceId,
  normalizeHostAudios
} from "./hostAudioModel";

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
  postDraft?: (message: JsonObject) => Promise<unknown>;
  draftPublishDelayMs?: number;
}

export interface HostAudioController {
  getState(): HostAudioEditorState;
  subscribe(listener: () => void): () => void;
  addSet(): void;
  removeSet(index: number): void;
  renameSet(index: number, name: string): void;
  addLine(setIndex: number): void;
  removeLine(setIndex: number, lineIndex: number): void;
  updateLine(
    setIndex: number,
    lineIndex: number,
    patch: Partial<Pick<HostAudioLine, "text" | "url">>
  ): void;
  uploadLineAsset(setIndex: number, lineIndex: number, file: File): Promise<HostAudios | null>;
  undo(): void;
  redo(): void;
  revert(): void;
  save(): Promise<HostAudios | null>;
}

const HISTORY_LIMIT = 50;

function clone(value: HostAudios): HostAudios {
  return normalizeHostAudios(JSON.parse(JSON.stringify(value)) as HostAudios);
}

export function createHostAudioController(
  options: HostAudioControllerOptions
): HostAudioController {
  const { api } = options;
  const listeners = new Set<() => void>();
  let current = normalizeHostAudios(options.initialHostAudios);
  let savedSnapshot = hostAudiosSnapshot(current);
  const sessionDraftPublisher = options.postDraft
    ? createSessionDraftPublisher({
        postDraft: options.postDraft,
        savedSnapshot,
        delayMs: options.draftPublishDelayMs,
        clearMessage: { clearHostAudios: true },
        draftMessage: (snapshot) => ({ hostAudios: JSON.parse(snapshot) as HostAudios })
      })
    : null;
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
    sessionDraftPublisher?.schedule(hostAudiosSnapshot(current));
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
        draft.hostAudios = [
          ...draft.hostAudios,
          { id: `host-audio-${n}`, name: `Host Audio ${n}`, lines: [] }
        ];
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
        set.lines = [
          ...set.lines,
          { id: makeHostAudioReferenceId("host-line"), text: "", url: "" }
        ];
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
        if (Object.prototype.hasOwnProperty.call(patch, "url")
          && !String(patch.url || "").trim()
          && !set.lines[lineIndex].blobPath) {
          set.lines = set.lines.filter((_, i) => i !== lineIndex);
          return;
        }
        set.lines[lineIndex] = { ...set.lines[lineIndex], ...patch };
      }),
    uploadLineAsset: async (setIndex, lineIndex, file) => {
      const set = current.hostAudios[setIndex];
      const line = set?.lines[lineIndex];
      if (!set || !line || !api.uploadHostAudioAsset) return null;
      saving = true;
      error = null;
      emit();
      try {
        const response = await api.uploadHostAudioAsset(current, set.id, line.id, file);
        current = normalizeHostAudios(response.hostAudios);
        undoStack.length = 0;
        redoStack.length = 0;
        if (response.storage?.kind === "live-prototype") {
          sessionDraftPublisher?.schedule(hostAudiosSnapshot(current));
        } else {
          savedSnapshot = hostAudiosSnapshot(current);
          sessionDraftPublisher?.markSaved(savedSnapshot);
        }
        saving = false;
        emit();
        return current;
      } catch (caught) {
        saving = false;
        error = caught instanceof Error ? caught.message : String(caught);
        emit();
        return null;
      }
    },

    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(current);
      current = previous;
      emit();
      sessionDraftPublisher?.schedule(hostAudiosSnapshot(current));
    },
    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(current);
      current = next;
      emit();
      sessionDraftPublisher?.schedule(hostAudiosSnapshot(current));
    },
    revert: () => {
      undoStack.push(current);
      redoStack.length = 0;
      current = normalizeHostAudios(JSON.parse(savedSnapshot) as HostAudios);
      emit();
      sessionDraftPublisher?.schedule(hostAudiosSnapshot(current));
    },
    save: async () => {
      if (requestLivePrototypeSave()) return current;
      saving = true;
      error = null;
      emit();
      try {
        const response = await api.saveHostAudios(current);
        const saved = normalizeHostAudios(response.hostAudios || current);
        current = saved;
        savedSnapshot = hostAudiosSnapshot(saved);
        sessionDraftPublisher?.markSaved(savedSnapshot);
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
