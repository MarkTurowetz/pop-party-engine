import type { ArtApi } from "../../api/artApi";
import type { ArtAsset, JsonObject } from "../../types/game-data";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";
import { requestLivePrototypeSave } from "../common/livePrototypeWorkspace";

/**
 * Controller for the Art asset manager (slice 1 of the Art tool). Holds the
 * replaceable art assets and a staged-replacement map (assetId -> uploaded image),
 * committed to the server via ArtApi.replaceArtAsset on save — matching the legacy
 * pending-replacement / global-save model. Composition + organization editing land
 * in later slices and will extend this controller.
 */
export interface ArtAssetReplacement {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface ArtAssetsEditorState {
  assets: ArtAsset[];
  pending: Map<string, ArtAssetReplacement>;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

export interface ArtAssetsControllerOptions {
  initialAssets: ArtAsset[];
  api: ArtApi;
  postDraft?: (message: JsonObject) => Promise<unknown>;
  draftPublishDelayMs?: number;
}

export interface ArtAssetsController {
  getState(): ArtAssetsEditorState;
  subscribe(listener: () => void): () => void;
  stageReplacement(assetId: string, replacement: ArtAssetReplacement): void;
  clearReplacement(assetId: string): void;
  save(): Promise<boolean>;
}

function pendingSnapshot(pending: Map<string, ArtAssetReplacement>): string {
  return JSON.stringify([...pending.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function pendingDraftMessage(snapshot: string): JsonObject {
  return { artAssetReplacements: Object.fromEntries(JSON.parse(snapshot) as [string, ArtAssetReplacement][]) };
}

export function createArtAssetsController(options: ArtAssetsControllerOptions): ArtAssetsController {
  const { api } = options;
  const listeners = new Set<() => void>();
  let assets = [...options.initialAssets];
  let pending = new Map<string, ArtAssetReplacement>();
  const sessionDraftPublisher = options.postDraft
    ? createSessionDraftPublisher({
        postDraft: options.postDraft,
        savedSnapshot: pendingSnapshot(pending),
        delayMs: options.draftPublishDelayMs,
        clearMessage: { clearArtAssetReplacements: true },
        draftMessage: pendingDraftMessage
      })
    : null;
  let saving = false;
  let error: string | null = null;
  let cachedState = buildState();

  function buildState(): ArtAssetsEditorState {
    return { assets, pending, dirty: pending.size > 0, saving, error };
  }

  function emit(): void {
    cachedState = buildState();
    listeners.forEach((listener) => listener());
  }

  function scheduleDraft(): void {
    sessionDraftPublisher?.schedule(pendingSnapshot(pending));
  }

  return {
    getState: () => cachedState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stageReplacement: (assetId, replacement) => {
      pending = new Map(pending);
      pending.set(assetId, replacement);
      emit();
      scheduleDraft();
    },
    clearReplacement: (assetId) => {
      pending = new Map(pending);
      pending.delete(assetId);
      emit();
      scheduleDraft();
    },
    save: async () => {
      if (requestLivePrototypeSave()) return true;
      if (!pending.size) return true;
      saving = true;
      error = null;
      emit();
      try {
        for (const [assetId, replacement] of pending) {
          const response = await api.replaceArtAsset(assetId, { ...replacement });
          const updated = response.asset;
          assets = assets.map((asset) => (asset.id === updated.id ? updated : asset));
        }
        pending = new Map();
        sessionDraftPublisher?.markSaved(pendingSnapshot(pending));
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
