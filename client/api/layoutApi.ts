import type { ApiClient } from "./http";
import type { ControllerLayoutCollection, LayoutResponse, StageLayoutCollection } from "../types/game-data";

export interface LayoutApi {
  loadStageLayouts(): Promise<LayoutResponse<StageLayoutCollection>>;
  saveStageLayouts(layouts: StageLayoutCollection): Promise<LayoutResponse<StageLayoutCollection>>;
  loadControllerLayouts(): Promise<LayoutResponse<ControllerLayoutCollection>>;
  saveControllerLayouts(layouts: ControllerLayoutCollection): Promise<LayoutResponse<ControllerLayoutCollection>>;
}

export function createLayoutApi(client: ApiClient): LayoutApi {
  return {
    loadStageLayouts: () => client.getJson<LayoutResponse<StageLayoutCollection>>("/api/stage-layouts"),
    saveStageLayouts: (layouts) => client.postJson<LayoutResponse<StageLayoutCollection>>("/api/stage-layouts", { layouts }),
    loadControllerLayouts: () => client.getJson<LayoutResponse<ControllerLayoutCollection>>("/api/controller-layouts"),
    saveControllerLayouts: (layouts) => client.postJson<LayoutResponse<ControllerLayoutCollection>>("/api/controller-layouts", { layouts })
  };
}
