import type { ApiClient } from "./http";
import type { HostAudios, HostAudiosResponse } from "../types/game-data";

export interface HostAudioApi {
  loadHostAudios(): Promise<HostAudiosResponse>;
  saveHostAudios(hostAudios: HostAudios): Promise<HostAudiosResponse>;
}

export function createHostAudioApi(client: ApiClient): HostAudioApi {
  return {
    loadHostAudios: () => client.getJson<HostAudiosResponse>("/api/host-audios"),
    saveHostAudios: (hostAudios) => client.postJson<HostAudiosResponse>("/api/host-audios", { hostAudios })
  };
}
