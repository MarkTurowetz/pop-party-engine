import type { ApiClient } from "./http";
import type { ArtAssetsResponse, ArtComposition, JsonObject } from "../types/game-data";

export interface ArtApi {
  loadArtAssets(): Promise<ArtAssetsResponse>;
  saveArtComposition(compositionId: string, composition: ArtComposition): Promise<JsonObject>;
  deleteArtComposition(compositionId: string): Promise<JsonObject>;
}

export function createArtApi(client: ApiClient): ArtApi {
  return {
    loadArtAssets: () => client.getJson<ArtAssetsResponse>("/api/art-assets"),
    saveArtComposition: (compositionId, composition) => (
      client.postJson<JsonObject>(`/api/art-compositions/${encodeURIComponent(compositionId)}`, { composition })
    ),
    deleteArtComposition: (compositionId) => (
      client.deleteJson<JsonObject>(`/api/art-compositions/${encodeURIComponent(compositionId)}`)
    )
  };
}
