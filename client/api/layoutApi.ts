import type { ApiClient } from "./http";
import { validateLayoutResponse, validateLayoutSaveResponse } from "./validators";
import type { ControllerLayoutCollection, LayoutResponse, LayoutSaveResponse, StageLayoutCollection } from "../types/game-data";
import { toolWriteIdempotencyKey } from "./draftRevision";

export interface LayoutApi {
  loadStageLayouts(): Promise<LayoutResponse<StageLayoutCollection>>;
  saveStageLayouts(layouts: StageLayoutCollection): Promise<LayoutSaveResponse<StageLayoutCollection>>;
  loadControllerLayouts(): Promise<LayoutResponse<ControllerLayoutCollection>>;
  saveControllerLayouts(layouts: ControllerLayoutCollection): Promise<LayoutSaveResponse<ControllerLayoutCollection>>;
}

export function createLayoutApi(client: ApiClient): LayoutApi {
  let stageRevision = "";
  let controllerRevision = "";
  return {
    loadStageLayouts: async () => {
      const response = validateLayoutResponse<StageLayoutCollection>(
        await client.getJson<unknown>("/api/stage-layouts"),
        "/api/stage-layouts"
      );
      stageRevision = response.revision || "";
      return response;
    },
    saveStageLayouts: async (layouts) => {
      const response = validateLayoutSaveResponse<StageLayoutCollection>(
        await client.postJson<unknown>("/api/stage-layouts", {
          layouts,
          revision: stageRevision,
          idempotencyKey: toolWriteIdempotencyKey("stage-layouts")
        }),
        "/api/stage-layouts"
      );
      stageRevision = response.revision || "";
      return response;
    },
    loadControllerLayouts: async () => {
      const response = validateLayoutResponse<ControllerLayoutCollection>(
        await client.getJson<unknown>("/api/controller-layouts"),
        "/api/controller-layouts"
      );
      controllerRevision = response.revision || "";
      return response;
    },
    saveControllerLayouts: async (layouts) => {
      const response = validateLayoutSaveResponse<ControllerLayoutCollection>(
        await client.postJson<unknown>("/api/controller-layouts", {
          layouts,
          revision: controllerRevision,
          idempotencyKey: toolWriteIdempotencyKey("controller-layouts")
        }),
        "/api/controller-layouts"
      );
      controllerRevision = response.revision || "";
      return response;
    }
  };
}
