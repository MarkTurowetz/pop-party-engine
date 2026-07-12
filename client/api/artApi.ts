import type { ApiClient } from "./http";
import { validateArtAssetReplaceResponse, validateArtAssetsResponse, validateArtCompositionDeleteResponse, validateArtCompositionSaveResponse, validateArtOrganizationSaveResponse } from "./validators";
import type { ArtAssetReplaceResponse, ArtAssetsResponse, ArtComposition, ArtCompositionDeleteResponse, ArtCompositionSaveResponse, ArtCompositionsSaveResponse, ArtOrganization, ArtOrganizationSaveResponse, JsonObject } from "../types/game-data";

export interface ArtApi {
  loadArtAssets(): Promise<ArtAssetsResponse>;
  saveArtComposition(compositionId: string, composition: ArtComposition): Promise<ArtCompositionSaveResponse>;
  saveArtCompositions?(compositions: ArtComposition[]): Promise<ArtCompositionsSaveResponse>;
  saveArtOrganization(organization: ArtOrganization): Promise<ArtOrganizationSaveResponse>;
  deleteArtComposition(compositionId: string): Promise<ArtCompositionDeleteResponse>;
  replaceArtAsset(assetId: string, payload: JsonObject): Promise<ArtAssetReplaceResponse>;
}

export function createArtApi(client: ApiClient): ArtApi {
  let revision = "";
  const rememberRevision = <T extends { revision?: string }>(response: T): T => {
    if (response.revision) revision = response.revision;
    return response;
  };
  return {
    loadArtAssets: async () => rememberRevision(validateArtAssetsResponse(await client.getJson<unknown>("/api/art-assets"))),
    saveArtComposition: async (compositionId, composition) => (
      rememberRevision(validateArtCompositionSaveResponse(
        await client.postJson<unknown>(`/api/art-compositions/${encodeURIComponent(compositionId)}`, { composition, revision }),
        `/api/art-compositions/${compositionId}`
      ))
    ),
    saveArtCompositions: async (compositions) => rememberRevision(
      validateArtCompositionDeleteResponse(
        await client.postJson<unknown>("/api/art-compositions", { compositions, revision }),
        "/api/art-compositions"
      )
    ),
    saveArtOrganization: async (organization) => (
      rememberRevision(validateArtOrganizationSaveResponse(await client.postJson<unknown>("/api/art-organization", { organization, revision })))
    ),
    deleteArtComposition: async (compositionId) => (
      rememberRevision(validateArtCompositionDeleteResponse(
        await client.deleteJson<unknown>(`/api/art-compositions/${encodeURIComponent(compositionId)}${revision ? `?revision=${encodeURIComponent(revision)}` : ""}`),
        `/api/art-compositions/${compositionId}`
      ))
    ),
    replaceArtAsset: async (assetId, payload) => (
      rememberRevision(validateArtAssetReplaceResponse(
        await client.postJson<unknown>(`/api/art-assets/${encodeURIComponent(assetId)}`, { ...payload, revision }),
        `/api/art-assets/${assetId}`
      ))
    )
  };
}
