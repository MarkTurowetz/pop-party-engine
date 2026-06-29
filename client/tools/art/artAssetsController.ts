import type { ArtApi } from "../../api/artApi";
import type { ArtAsset } from "../../types/game-data";

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
}

export interface ArtAssetsController {
  getState(): ArtAssetsEditorState;
  subscribe(listener: () => void): () => void;
  stageReplacement(assetId: string, replacement: ArtAssetReplacement): void;
  clearReplacement(assetId: string): void;
  save(): Promise<boolean>;
}

export function createArtAssetsController(options: ArtAssetsControllerOptions): ArtAssetsController {
  const { api } = options;
  const listeners = new Set<() => void>();
  let assets = [...options.initialAssets];
  let pending = new Map<string, ArtAssetReplacement>();
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
    },
    clearReplacement: (assetId) => {
      pending = new Map(pending);
      pending.delete(assetId);
      emit();
    },
    save: async () => {
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
