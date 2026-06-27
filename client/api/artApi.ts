import type { ApiClient } from "./http";
import { validateArtAssetReplaceResponse, validateArtAssetsResponse, validateArtCompositionDeleteResponse, validateArtCompositionSaveResponse, validateArtOrganizationSaveResponse } from "./validators";
import type { ArtAssetReplaceResponse, ArtAssetsResponse, ArtComposition, ArtCompositionDeleteResponse, ArtCompositionSaveResponse, ArtOrganization, ArtOrganizationSaveResponse, JsonObject } from "../types/game-data";

export interface ArtApi {
  loadArtAssets(): Promise<ArtAssetsResponse>;
  saveArtComposition(compositionId: string, composition: ArtComposition): Promise<ArtCompositionSaveResponse>;
  saveArtOrganization(organization: ArtOrganization): Promise<ArtOrganizationSaveResponse>;
  deleteArtComposition(compositionId: string): Promise<ArtCompositionDeleteResponse>;
  replaceArtAsset(assetId: string, payload: JsonObject): Promise<ArtAssetReplaceResponse>;
}

export function createArtApi(client: ApiClient): ArtApi {
  return {
    loadArtAssets: async () => validateArtAssetsResponse(await client.getJson<unknown>("/api/art-assets")),
    saveArtComposition: async (compositionId, composition) => (
      validateArtCompositionSaveResponse(
        await client.postJson<unknown>(`/api/art-compositions/${encodeURIComponent(compositionId)}`, { composition }),
        `/api/art-compositions/${compositionId}`
      )
    ),
    saveArtOrganization: async (organization) => (
      validateArtOrganizationSaveResponse(await client.postJson<unknown>("/api/art-organization", { organization }))
    ),
    deleteArtComposition: async (compositionId) => (
      validateArtCompositionDeleteResponse(
        await client.deleteJson<unknown>(`/api/art-compositions/${encodeURIComponent(compositionId)}`),
        `/api/art-compositions/${compositionId}`
      )
    ),
    replaceArtAsset: async (assetId, payload) => (
      validateArtAssetReplaceResponse(
        await client.postJson<unknown>(`/api/art-assets/${encodeURIComponent(assetId)}`, payload),
        `/api/art-assets/${assetId}`
      )
    )
  };
}
