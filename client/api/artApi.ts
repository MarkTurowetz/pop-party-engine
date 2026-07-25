import type { ApiClient } from "./http";
import { validateArtAssetReplaceResponse, validateArtAssetsResponse, validateArtCompositionCleanupResponse, validateArtCompositionDeleteResponse, validateArtCompositionSaveResponse, validateArtCompositionsSaveResponse, validateArtOrganizationSaveResponse } from "./validators";
import type { ArtAssetReplaceResponse, ArtAssetsResponse, ArtComposition, ArtCompositionCleanupRequest, ArtCompositionCleanupResponse, ArtCompositionDeleteResponse, ArtCompositionSaveResponse, ArtCompositionsSaveResponse, ArtOrganization, ArtOrganizationSaveResponse, JsonObject } from "../types/game-data";
import { ApiError } from "./http";
import { toolWriteIdempotencyKey } from "./draftRevision";

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
  let draftRevision = "";
  let compositionRevisions: Record<string, string> = {};
  const rememberRevision = <T extends { revision?: string; draftRevision?: string; compositionRevisions?: Record<string, string> }>(response: T): T => {
    if (response.revision) revision = response.revision;
    if (response.draftRevision) draftRevision = response.draftRevision;
    if (response.compositionRevisions) {
      compositionRevisions = { ...compositionRevisions, ...response.compositionRevisions };
    }
    return response;
  };
  const rememberErrorRevision = (error: unknown): void => {
    if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== "object") return;
    const nextRevision = String((error.payload as { revision?: unknown }).revision || "");
    if (nextRevision) revision = nextRevision;
    const nextDraftRevision = String((error.payload as { draftRevision?: unknown }).draftRevision || "");
    if (nextDraftRevision) draftRevision = nextDraftRevision;
    const nextCompositionRevisions = (error.payload as { compositionRevisions?: unknown }).compositionRevisions;
    if (nextCompositionRevisions && typeof nextCompositionRevisions === "object" && !Array.isArray(nextCompositionRevisions)) {
      compositionRevisions = { ...compositionRevisions, ...(nextCompositionRevisions as Record<string, string>) };
    }
  };
  const mutate = async <T extends { revision?: string }>(request: () => Promise<T>): Promise<T> => {
    try {
      return rememberRevision(await request());
    } catch (error) {
      rememberErrorRevision(error);
      throw error;
    }
  };
  const revisionQuery = (): string => {
    const params = new URLSearchParams();
    if (revision) params.set("revision", revision);
    if (draftRevision) params.set("draftRevision", draftRevision);
    const query = params.toString();
    return query ? `?${query}` : "";
  };
  return {
    loadArtAssets: async () => rememberRevision(validateArtAssetsResponse(await client.getJson<unknown>("/api/art-assets"))),
    saveArtComposition: async (compositionId, composition) => mutate(async () => (
      validateArtCompositionSaveResponse(
        await client.postJson<unknown>(`/api/art-compositions/${encodeURIComponent(compositionId)}`, {
          composition,
          revision,
          draftRevision,
          idempotencyKey: toolWriteIdempotencyKey("art-composition"),
          expectedCompositionRevisions: { [compositionId]: compositionRevisions[compositionId] || "" }
        }),
        `/api/art-compositions/${compositionId}`
      )
    )),
    saveArtCompositions: async (compositions) => mutate(async () => (
      validateArtCompositionsSaveResponse(
        await client.postJson<unknown>("/api/art-compositions", {
          compositions,
          revision,
          draftRevision,
          idempotencyKey: toolWriteIdempotencyKey("art-compositions"),
          expectedCompositionRevisions: Object.fromEntries(
            compositions.map((composition) => [composition.id, compositionRevisions[composition.id] || ""])
          )
        }),
        "/api/art-compositions"
      )
    )),
    saveArtOrganization: async (organization) => mutate(async () => (
      validateArtOrganizationSaveResponse(await client.postJson<unknown>("/api/art-organization", {
        organization,
        revision,
        draftRevision,
        idempotencyKey: toolWriteIdempotencyKey("art-organization")
      }))
    )),
    deleteArtComposition: async (compositionId) => mutate(async () => (
      validateArtCompositionDeleteResponse(
        await client.deleteJson<unknown>(
          `/api/art-compositions/${encodeURIComponent(compositionId)}${revisionQuery()}`
        ),
        `/api/art-compositions/${compositionId}`
      )
    )),
    cleanupArtCompositions: async (request) => {
      try {
        return rememberRevision(validateArtCompositionCleanupResponse(
          await client.postJson<unknown>("/api/art-compositions/cleanup", {
            ...request,
            revision,
            draftRevision,
            idempotencyKey: toolWriteIdempotencyKey("art-cleanup")
          })
        ));
      } catch (error) {
        rememberErrorRevision(error);
        throw error;
      }
    },
    replaceArtAsset: async (assetId, payload) => mutate(async () => (
      validateArtAssetReplaceResponse(
        await client.postJson<unknown>(`/api/art-assets/${encodeURIComponent(assetId)}`, {
          ...payload,
          revision,
          draftRevision,
          idempotencyKey: toolWriteIdempotencyKey("art-asset")
        }),
        `/api/art-assets/${assetId}`
      )
    ))
  };
}
