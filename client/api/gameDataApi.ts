import { createArtApi, type ArtApi } from "./artApi";
import { createConstantsApi, type ConstantsApi } from "./constantsApi";
import { createFlowApi, type FlowApi } from "./flowApi";
import { createApiClient, type ApiClient, type ApiClientOptions } from "./http";
import { createHostAudioApi, type HostAudioApi } from "./hostAudioApi";
import { createLayoutApi, type LayoutApi } from "./layoutApi";
import { createToolDraftApi, type ToolDraftApi } from "./toolDraftApi";
import { validateHealthResponse } from "./validators";
import type { HealthResponse } from "../types/game-data";

export interface GameDataApi {
  client: ApiClient;
  health(): Promise<HealthResponse>;
  flow: FlowApi;
  layout: LayoutApi;
  art: ArtApi;
  constants: ConstantsApi;
  hostAudio: HostAudioApi;
  drafts: ToolDraftApi;
}

export function createGameDataApi(options: ApiClientOptions = {}): GameDataApi {
  const client = createApiClient(options);
  return {
    client,
    health: async () => validateHealthResponse(await client.getJson<unknown>("/api/health")),
    flow: createFlowApi(client),
    layout: createLayoutApi(client),
    art: createArtApi(client),
    constants: createConstantsApi(client),
    hostAudio: createHostAudioApi(client),
    drafts: createToolDraftApi(client)
  };
}
