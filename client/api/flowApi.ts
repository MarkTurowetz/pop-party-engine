import type { ApiClient } from "./http";
import { validateGameFlowResponse, validateGameFlowSaveResponse } from "./validators";
import type { GameFlow, GameFlowResponse, GameFlowSaveResponse, JsonObject } from "../types/game-data";
import { toolWriteIdempotencyKey } from "./draftRevision";

export interface FlowApi {
  loadGameFlow(): Promise<GameFlowResponse>;
  saveGameFlow(flow: GameFlow): Promise<GameFlowSaveResponse>;
  saveToolDraft(message: JsonObject): Promise<JsonObject>;
}

export function createFlowApi(client: ApiClient): FlowApi {
  let revision = "";
  return {
    loadGameFlow: async () => {
      const response = validateGameFlowResponse(await client.getJson<unknown>("/api/game-flow"));
      revision = response.revision || "";
      return response;
    },
    saveGameFlow: async (flow) => {
      const response = validateGameFlowSaveResponse(await client.postJson<unknown>("/api/game-flow", {
        flow,
        revision,
        idempotencyKey: toolWriteIdempotencyKey("flow")
      }));
      revision = response.revision || "";
      return response;
    },
    saveToolDraft: (message) => client.postJson<JsonObject, JsonObject>("/api/tool-drafts", message)
  };
}
