import type { ApiClient } from "./http";
import { validateGameConstantsResponse } from "./validators";
import type { GameConstants, GameConstantsResponse } from "../types/game-data";

export interface ConstantsApi {
  loadGameConstants(): Promise<GameConstantsResponse>;
  saveGameConstants(constants: GameConstants): Promise<GameConstantsResponse>;
}

export function createConstantsApi(client: ApiClient): ConstantsApi {
  return {
    loadGameConstants: async () => validateGameConstantsResponse(await client.getJson<unknown>("/api/game-constants")),
    saveGameConstants: async (constants) => validateGameConstantsResponse(await client.postJson<unknown>("/api/game-constants", { constants }))
  };
}
