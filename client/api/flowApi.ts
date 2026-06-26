import type { ApiClient } from "./http";
import type { GameFlow, GameFlowResponse, JsonObject } from "../types/game-data";

export interface FlowApi {
  loadGameFlow(): Promise<GameFlowResponse>;
  saveGameFlow(flow: GameFlow): Promise<GameFlowResponse>;
  saveToolDraft(message: JsonObject): Promise<JsonObject>;
}

export function createFlowApi(client: ApiClient): FlowApi {
  return {
    loadGameFlow: () => client.getJson<GameFlowResponse>("/api/game-flow"),
    saveGameFlow: (flow) => client.postJson<GameFlowResponse>("/api/game-flow", { flow }),
    saveToolDraft: (message) => client.postJson<JsonObject, JsonObject>("/api/tool-drafts", message)
  };
}
