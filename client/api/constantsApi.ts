import type { ApiClient } from "./http";
import { validateGameConstantsResponse, validateGameConstantsSaveResponse } from "./validators";
import type { GameConstants, GameConstantsResponse, GameConstantsSaveResponse } from "../types/game-data";

export interface ConstantsApi {
  loadGameConstants(): Promise<GameConstantsResponse>;
  saveGameConstants(constants: GameConstants): Promise<GameConstantsSaveResponse>;
}

export function createConstantsApi(client: ApiClient): ConstantsApi {
  return {
    loadGameConstants: async () => validateGameConstantsResponse(await client.getJson<unknown>("/api/game-constants")),
    saveGameConstants: async (constants) => validateGameConstantsSaveResponse(await client.postJson<unknown>("/api/game-constants", { constants }))
  };
}
