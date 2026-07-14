import type { ApiClient } from "./http";
import { validateArtAssetReplaceResponse, validateArtAssetsResponse, validateArtCompositionCleanupResponse, validateArtCompositionDeleteResponse, validateArtCompositionSaveResponse, validateArtCompositionsSaveResponse, validateArtOrganizationSaveResponse } from "./validators";
import type { ArtAssetReplaceResponse, ArtAssetsResponse, ArtComposition, ArtCompositionCleanupRequest, ArtCompositionCleanupResponse, ArtCompositionDeleteResponse, ArtCompositionSaveResponse, ArtCompositionsSaveResponse, ArtOrganization, ArtOrganizationSaveResponse, JsonObject } from "../types/game-data";
import { ApiError } from "./http";

export interface ArtApi {
  loadArtAssets(): Promise<ArtAssetsResponse>;
  saveArtComposition(compositionId: string, composition: ArtComposition): Promise<ArtCompositionSaveResponse>;
  saveArtCompositions?(compositions: ArtComposition[]): Promise<ArtCompositionsSaveResponse>;
  saveArtOrganization(organization: ArtOrganization): Promise<ArtOrganizationSaveResponse>;
  deleteArtComposition(compositionId: string): Promise<ArtCompositionDeleteResponse>;
  cleanupArtCompositions(request: ArtCompositionCleanupRequest): Promise<ArtCompositionCleanupResponse>;
  replaceArtAsset(assetId: string, payload: JsonObject): Promise<ArtAssetReplaceResponse>;
}

export function createArtApi(client: ApiClient): ArtApi {
  let revision = "";
  const rememberRevision = <T extends { revision?: string }>(response: T): T => {
    if (response.revision) revision = response.revision;
    return response;
  };
  const rememberErrorRevision = (error: unknown): void => {
    if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== "object") return;
    const nextRevision = String((error.payload as { revision?: unknown }).revision || "");
    if (nextRevision) revision = nextRevision;
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
      validateArtCompositionsSaveResponse(
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
    cleanupArtCompositions: async (request) => {
      try {
        return rememberRevision(validateArtCompositionCleanupResponse(
          await client.postJson<unknown>("/api/art-compositions/cleanup", { ...request, revision })
        ));
      } catch (error) {
        rememberErrorRevision(error);
        throw error;
      }
    },
    replaceArtAsset: async (assetId, payload) => (
      rememberRevision(validateArtAssetReplaceResponse(
        await client.postJson<unknown>(`/api/art-assets/${encodeURIComponent(assetId)}`, { ...payload, revision }),
        `/api/art-assets/${assetId}`
      ))
    )
  };
}
