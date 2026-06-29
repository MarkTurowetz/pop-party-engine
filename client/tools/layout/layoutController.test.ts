import { describe, expect, it, vi } from "vitest";
import { createLayoutController } from "./layoutController";
import type { LayoutApi } from "../../api/layoutApi";
import type { LayoutSaveResponse, StageLayoutCollection } from "../../types/game-data";

function layouts(): StageLayoutCollection {
  return {
    canvas: { width: 1920, height: 1080 },
    global: { id: "global", name: "Global", elements: [] },
    states: [{ id: "intro", name: "Intro", elements: [{ id: "e1", name: "E1", kind: "text", x: 0, y: 0 } as never] }]
  };
}

function fakeApi(overrides: Partial<LayoutApi> = {}): LayoutApi {
  return {
    loadStageLayouts: vi.fn(),
    saveStageLayouts: vi.fn(async (l: StageLayoutCollection) => ({ ok: true, layouts: l, storage: {} }) as unknown as LayoutSaveResponse<StageLayoutCollection>),
    loadControllerLayouts: vi.fn(),
    saveControllerLayouts: vi.fn(),
    ...overrides
  } as LayoutApi;
}

describe("createLayoutController", () => {
  it("starts clean with the global group selected", () => {
    const controller = createLayoutController({ initialLayouts: layouts(), mode: "stage", api: fakeApi() });
    expect(controller.getState().dirty).toBe(false);
    expect(controller.getState().selectedGroupId).toBe("global");
  });

  it("adds a text element to the selected group, dirty + undo", () => {
    const controller = createLayoutController({ initialLayouts: layouts(), mode: "stage", api: fakeApi() });
    controller.selectGroup("intro");
    controller.addTextElement();
    const intro = controller.getState().layouts.states[0];
    expect(intro.elements).toHaveLength(2);
    expect(controller.getState().dirty).toBe(true);
    controller.undo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(1);
  });

  it("updates and moves an element", () => {
    const controller = createLayoutController({ initialLayouts: layouts(), mode: "stage", api: fakeApi() });
    controller.selectGroup("intro");
    controller.updateElement("e1", { name: "Renamed" } as never);
    controller.moveElement("e1", 12.345, 6.789);
    const el = controller.getState().layouts.states[0].elements[0] as Record<string, unknown>;
    expect(el.name).toBe("Renamed");
    expect(el.x).toBe(12.345);
  });

  it("saves via the stage endpoint and clears dirty", async () => {
    const api = fakeApi();
    const controller = createLayoutController({ initialLayouts: layouts(), mode: "stage", api });
    controller.selectGroup("intro");
    controller.addTextElement();
    const ok = await controller.save();
    expect(ok).toBe(true);
    expect(api.saveStageLayouts).toHaveBeenCalledTimes(1);
    expect(controller.getState().dirty).toBe(false);
  });
});
