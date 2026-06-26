import type { ApiClient } from "./http";
import { validateHostAudiosResponse, validateHostAudiosSaveResponse } from "./validators";
import type { HostAudios, HostAudiosResponse, HostAudiosSaveResponse } from "../types/game-data";

export interface HostAudioApi {
  loadHostAudios(): Promise<HostAudiosResponse>;
  saveHostAudios(hostAudios: HostAudios): Promise<HostAudiosSaveResponse>;
}

export function createHostAudioApi(client: ApiClient): HostAudioApi {
  return {
    loadHostAudios: async () => validateHostAudiosResponse(await client.getJson<unknown>("/api/host-audios")),
    saveHostAudios: async (hostAudios) => validateHostAudiosSaveResponse(await client.postJson<unknown>("/api/host-audios", { hostAudios }))
  };
}
