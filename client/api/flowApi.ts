import type { ApiClient } from "./http";
import { validateGameFlowResponse, validateGameFlowSaveResponse } from "./validators";
import type { GameFlow, GameFlowResponse, GameFlowSaveResponse, JsonObject } from "../types/game-data";

export interface FlowApi {
  loadGameFlow(): Promise<GameFlowResponse>;
  saveGameFlow(flow: GameFlow): Promise<GameFlowSaveResponse>;
  saveToolDraft(message: JsonObject): Promise<JsonObject>;
}

export function createFlowApi(client: ApiClient): FlowApi {
  return {
    loadGameFlow: async () => validateGameFlowResponse(await client.getJson<unknown>("/api/game-flow")),
    saveGameFlow: async (flow) => validateGameFlowSaveResponse(await client.postJson<unknown>("/api/game-flow", { flow })),
    saveToolDraft: (message) => client.postJson<JsonObject, JsonObject>("/api/tool-drafts", message)
  };
}
