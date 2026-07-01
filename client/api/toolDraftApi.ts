import type { JsonObject } from "../types/game-data";
import type { ApiClient } from "./http";

export interface ToolDraftApi {
  saveToolDraft(message: JsonObject): Promise<JsonObject>;
}

export function createToolDraftApi(client: ApiClient): ToolDraftApi {
  return {
    saveToolDraft: (message) => client.postJson<JsonObject, JsonObject>("/api/tool-drafts", message)
  };
}
