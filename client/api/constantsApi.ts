import type { ApiClient } from "./http";
import { validateGameConstantsResponse, validateGameConstantsSaveResponse } from "./validators";
import type { GameConstants, GameConstantsResponse, GameConstantsSaveResponse } from "../types/game-data";
import { toolWriteIdempotencyKey } from "./draftRevision";

export interface ConstantsApi {
  loadGameConstants(): Promise<GameConstantsResponse>;
  saveGameConstants(constants: GameConstants): Promise<GameConstantsSaveResponse>;
}

export function createConstantsApi(client: ApiClient): ConstantsApi {
  let revision = "";
  return {
    loadGameConstants: async () => {
      const response = validateGameConstantsResponse(await client.getJson<unknown>("/api/game-constants"));
      revision = response.revision || "";
      return response;
    },
    saveGameConstants: async (constants) => {
      const response = validateGameConstantsSaveResponse(await client.postJson<unknown>("/api/game-constants", {
        constants,
        revision,
        idempotencyKey: toolWriteIdempotencyKey("constants")
      }));
      revision = response.revision || "";
      return response;
    }
  };
}
