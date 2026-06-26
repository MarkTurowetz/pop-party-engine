import type { ApiClient } from "./http";
import { validateGameFlowResponse } from "./validators";
import type { GameFlow, GameFlowResponse, JsonObject } from "../types/game-data";

export interface FlowApi {
  loadGameFlow(): Promise<GameFlowResponse>;
  saveGameFlow(flow: GameFlow): Promise<GameFlowResponse>;
  saveToolDraft(message: JsonObject): Promise<JsonObject>;
}

export function createFlowApi(client: ApiClient): FlowApi {
  return {
    loadGameFlow: async () => validateGameFlowResponse(await client.getJson<unknown>("/api/game-flow")),
    saveGameFlow: async (flow) => validateGameFlowResponse(await client.postJson<unknown>("/api/game-flow", { flow })),
    saveToolDraft: (message) => client.postJson<JsonObject, JsonObject>("/api/tool-drafts", message)
  };
}
