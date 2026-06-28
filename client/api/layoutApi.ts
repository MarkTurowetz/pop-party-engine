import type { ApiClient } from "./http";
import { validateLayoutResponse, validateLayoutSaveResponse } from "./validators";
import type { ControllerLayoutCollection, LayoutResponse, LayoutSaveResponse, StageLayoutCollection } from "../types/game-data";

export interface LayoutApi {
  loadStageLayouts(): Promise<LayoutResponse<StageLayoutCollection>>;
  saveStageLayouts(layouts: StageLayoutCollection): Promise<LayoutSaveResponse<StageLayoutCollection>>;
  loadControllerLayouts(): Promise<LayoutResponse<ControllerLayoutCollection>>;
  saveControllerLayouts(layouts: ControllerLayoutCollection): Promise<LayoutSaveResponse<ControllerLayoutCollection>>;
}

export function createLayoutApi(client: ApiClient): LayoutApi {
  return {
    loadStageLayouts: async () => validateLayoutResponse<StageLayoutCollection>(await client.getJson<unknown>("/api/stage-layouts"), "/api/stage-layouts"),
    saveStageLayouts: async (layouts) => validateLayoutSaveResponse<StageLayoutCollection>(
      await client.postJson<unknown>("/api/stage-layouts", { layouts }),
      "/api/stage-layouts"
    ),
    loadControllerLayouts: async () => validateLayoutResponse<ControllerLayoutCollection>(
      await client.getJson<unknown>("/api/controller-layouts"),
      "/api/controller-layouts"
    ),
    saveControllerLayouts: async (layouts) => validateLayoutSaveResponse<ControllerLayoutCollection>(
      await client.postJson<unknown>("/api/controller-layouts", { layouts }),
      "/api/controller-layouts"
    )
  };
}
