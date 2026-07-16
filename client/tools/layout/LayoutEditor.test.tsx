import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LayoutApi } from "../../api/layoutApi";
import type { ArtComposition, LayoutSaveResponse, StageLayoutCollection } from "../../types/game-data";
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
    expect(markup).toContain('data-layout-react-component="object-list"');
  });

  it("renders layout art from the referenced Art Manager composition", () => {
    const api = fakeApi();
    const stageLayouts = {
      ...layouts(),
      global: {
        id: "global",
        name: "Global",
        elements: [
          {
            id: "player",
            name: "Player",
            kind: "art",
            artCompositionId: "player-object",
            x: 960,
            y: 540,
            width: 90,
            height: 40
          } as never
        ]
      }
    };
    const artCompositions: ArtComposition[] = [
      {
        id: "player-object",
        name: "Player Object",
        surface: "stage",
        compositionKind: "gameObject",
        canvas: { width: 120, height: 80 },
        components: [
          {
            id: "card",
            name: "Card",
            kind: "shape",
            x: 60,
            y: 40,
            width: 120,
            height: 80,
            fillColor: "#fff8df",
            borderColor: "#17131f",
            borderWidth: 4
          } as never
        ]
      }
    ];
    const stageController = createLayoutController({ initialLayouts: stageLayouts, mode: "stage", api });
    stageController.selectElement("player");
    const controllerController = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api
    });
    const markup = renderToStaticMarkup(
      <LayoutEditor
        artCompositions={artCompositions}
        stageController={stageController}
        controllerController={controllerController}
        surface="tools"
      />
    );

    expect(markup).toContain('class="layout-art-instance-canvas"');
    expect(markup).toContain('data-art-canvas-component="card"');
    expect(markup).toContain('data-layout-art-composition="player-object"');
    expect(markup).toContain('data-layout-object-art-composition="player-object"');
    expect(markup).toContain('data-layout-reset-art-dimensions="true"');
    expect(markup).toContain('data-layout-art-default-width="120"');
    expect(markup).toContain('data-layout-art-default-height="80"');
  });

  it("surfaces per-view configuration tags while keeping initial state independently editable", () => {
    const api = fakeApi();
    const controllerLayouts = layouts();
    controllerLayouts.global.elements = [
      {
        id: "warning",
        name: "Warning",
        kind: "art",
        defaultAnimationState: "Off",
        tags: ["Phase One", "Warning"],
        x: 195,
        y: 200,
        width: 330,
        height: 80
      } as never
    ];
    const stageController = createLayoutController({ initialLayouts: layouts(), mode: "stage", api });
    const controllerController = createLayoutController({ initialLayouts: controllerLayouts, mode: "controller", api });
    controllerController.selectElement("warning");

    const markup = renderToStaticMarkup(
      <LayoutEditor
        stageController={stageController}
        controllerController={controllerController}
        initialMode="controller"
      />
    );

    expect(markup).toContain('data-controller-preview-tag="all"');
    expect(markup).toContain('data-controller-preview-tag-input="true"');
    expect(markup).toContain('data-layout-object-initial-state="Off"');
    expect(markup).toContain('data-layout-object-tags="Phase One|Warning"');
    expect(markup).toContain('data-layout-element="warning"');
    expect(markup).toContain('data-layout-element-field="defaultAnimationState"');
    expect(markup).toContain('data-layout-element-field="tags"');
    expect(markup).toContain('data-layout-element-tag="Phase One"');
    expect(markup).toContain('<option value="Off" selected="">Off</option>');
  });
});
