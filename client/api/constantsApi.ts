import type { ApiClient } from "./http";
import type { GameConstants, GameConstantsResponse } from "../types/game-data";

export interface ConstantsApi {
  loadGameConstants(): Promise<GameConstantsResponse>;
  saveGameConstants(constants: GameConstants): Promise<GameConstantsResponse>;
}

export function createConstantsApi(client: ApiClient): ConstantsApi {
  return {
    loadGameConstants: () => client.getJson<GameConstantsResponse>("/api/game-constants"),
    saveGameConstants: (constants) => client.postJson<GameConstantsResponse>("/api/game-constants", { constants })
  };
}
