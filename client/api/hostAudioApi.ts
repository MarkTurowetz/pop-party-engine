import type { ApiClient } from "./http";
import { validateHostAudiosResponse, validateHostAudiosSaveResponse } from "./validators";
import type { HostAudios, HostAudiosResponse, HostAudiosSaveResponse } from "../types/game-data";
import { toolWriteIdempotencyKey } from "./draftRevision";

export interface HostAudioApi {
  loadHostAudios(): Promise<HostAudiosResponse>;
  saveHostAudios(hostAudios: HostAudios): Promise<HostAudiosSaveResponse>;
  uploadHostAudioAsset?(hostAudios: HostAudios, hostAudioId: string, lineId: string, file: File): Promise<HostAudiosSaveResponse>;
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Audio file could not be read"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function createHostAudioApi(client: ApiClient): HostAudioApi {
  let revision = "";
  return {
    loadHostAudios: async () => {
      const response = validateHostAudiosResponse(await client.getJson<unknown>("/api/host-audios"));
      revision = response.revision || "";
      return response;
    },
    saveHostAudios: async (hostAudios) => {
      const response = validateHostAudiosSaveResponse(await client.postJson<unknown>("/api/host-audios", {
        hostAudios,
        revision,
        idempotencyKey: toolWriteIdempotencyKey("host-audios")
      }));
      revision = response.revision || "";
      return response;
    },
    uploadHostAudioAsset: async (hostAudios, hostAudioId, lineId, file) => {
      const response = validateHostAudiosSaveResponse(await client.postJson<unknown>("/api/host-audios/assets", {
        hostAudios,
        hostAudioId,
        lineId,
        fileName: file.name,
        dataUrl: await fileDataUrl(file),
        revision,
        idempotencyKey: toolWriteIdempotencyKey("host-audio-asset")
      }), "/api/host-audios/assets");
      revision = response.revision || "";
      return response;
    }
  };
}
