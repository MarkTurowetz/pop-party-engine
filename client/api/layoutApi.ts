import type { ApiClient } from "./http";
import { validateLayoutResponse } from "./validators";
import type { ControllerLayoutCollection, LayoutResponse, StageLayoutCollection } from "../types/game-data";

export interface LayoutApi {
  loadStageLayouts(): Promise<LayoutResponse<StageLayoutCollection>>;
  saveStageLayouts(layouts: StageLayoutCollection): Promise<LayoutResponse<StageLayoutCollection>>;
  loadControllerLayouts(): Promise<LayoutResponse<ControllerLayoutCollection>>;
  saveControllerLayouts(layouts: ControllerLayoutCollection): Promise<LayoutResponse<ControllerLayoutCollection>>;
}

export function createLayoutApi(client: ApiClient): LayoutApi {
  return {
    loadStageLayouts: async () => validateLayoutResponse<StageLayoutCollection>(await client.getJson<unknown>("/api/stage-layouts"), "/api/stage-layouts"),
    saveStageLayouts: async (layouts) => validateLayoutResponse<StageLayoutCollection>(
      await client.postJson<unknown>("/api/stage-layouts", { layouts }),
      "/api/stage-layouts"
    ),
    loadControllerLayouts: async () => validateLayoutResponse<ControllerLayoutCollection>(
      await client.getJson<unknown>("/api/controller-layouts"),
      "/api/controller-layouts"
    ),
    saveControllerLayouts: async (layouts) => validateLayoutResponse<ControllerLayoutCollection>(
      await client.postJson<unknown>("/api/controller-layouts", { layouts }),
      "/api/controller-layouts"
    )
  };
}
