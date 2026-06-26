import type { ApiClient } from "./http";
import { validateHostAudiosResponse } from "./validators";
import type { HostAudios, HostAudiosResponse } from "../types/game-data";

export interface HostAudioApi {
  loadHostAudios(): Promise<HostAudiosResponse>;
  saveHostAudios(hostAudios: HostAudios): Promise<HostAudiosResponse>;
}

export function createHostAudioApi(client: ApiClient): HostAudioApi {
  return {
    loadHostAudios: async () => validateHostAudiosResponse(await client.getJson<unknown>("/api/host-audios")),
    saveHostAudios: async (hostAudios) => validateHostAudiosResponse(await client.postJson<unknown>("/api/host-audios", { hostAudios }))
  };
}
