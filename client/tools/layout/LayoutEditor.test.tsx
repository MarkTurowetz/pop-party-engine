import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LayoutApi } from "../../api/layoutApi";
import type { LayoutSaveResponse, StageLayoutCollection } from "../../types/game-data";
import { createLayoutController } from "./layoutController";
import { LayoutEditor } from "./LayoutEditor";

function layouts(): StageLayoutCollection {
  return {
    canvas: { width: 1920, height: 1080 },
    global: {
      id: "global",
      name: "Global",
      elements: [{ id: "title", name: "Title", kind: "text", x: 960, y: 220, width: 500, height: 120 } as never]
    },
    states: [{ id: "intro", name: "Intro", elements: [] }]
  };
}

function fakeApi(): LayoutApi {
  return {
    loadStageLayouts: vi.fn(),
    saveStageLayouts: vi.fn(
      async (nextLayouts: StageLayoutCollection) =>
        ({ ok: true, layouts: nextLayouts, storage: {} }) as unknown as LayoutSaveResponse<StageLayoutCollection>
    ),
    loadControllerLayouts: vi.fn(),
    saveControllerLayouts: vi.fn()
  } as LayoutApi;
}

describe("LayoutEditor", () => {
  it("uses a dominant preview panel with a right-side inspector", () => {
    const api = fakeApi();
    const stageController = createLayoutController({ initialLayouts: layouts(), mode: "stage", api });
    const controllerController = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api
    });
    const markup = renderToStaticMarkup(
      <LayoutEditor
        stageController={stageController}
        controllerController={controllerController}
        surface="tools"
      />
    );

    expect(markup).toContain('class="tool-main-columns layout-workspace-content"');
    expect(markup).toContain('class="flow-react-panel layout-preview-panel"');
    expect(markup).toContain('class="flow-react-panel flow-react-inspector layout-element-inspector"');
  });
});
