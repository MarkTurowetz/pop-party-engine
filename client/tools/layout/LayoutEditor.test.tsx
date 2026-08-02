import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LayoutApi } from "../../api/layoutApi";
import type {
  ArtComposition,
  LayoutSaveResponse,
  StageLayoutCollection
} from "../../types/game-data";
import { createLayoutController } from "./layoutController";
import { LayoutEditor } from "./LayoutEditor";

function layouts(): StageLayoutCollection {
  return {
    canvas: { width: 1920, height: 1080 },
    global: {
      id: "global",
      name: "Global",
      elements: [
        {
          id: "title",
          name: "Title",
          kind: "text",
          x: 960,
          y: 220,
          width: 500,
          height: 120
        } as never
      ]
    },
    states: [{ id: "intro", name: "Intro", elements: [] }]
  };
}

function fakeApi(): LayoutApi {
  return {
    loadStageLayouts: vi.fn(),
    saveStageLayouts: vi.fn(
      async (nextLayouts: StageLayoutCollection) =>
        ({
          ok: true,
          layouts: nextLayouts,
          storage: {}
        }) as unknown as LayoutSaveResponse<StageLayoutCollection>
    ),
    loadControllerLayouts: vi.fn(),
    saveControllerLayouts: vi.fn()
  } as LayoutApi;
}

describe("LayoutEditor", () => {
  it("uses a dominant preview panel with a right-side inspector", () => {
    const api = fakeApi();
    const stageController = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api
    });
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
    expect(markup).toContain(
      'class="flow-react-panel flow-react-inspector layout-element-inspector"'
    );
    expect(markup).toContain('data-layout-react-component="object-list"');
    expect(markup).toContain('data-layout-add-game-object="true"');
    expect(markup).not.toContain("data-layout-add-group");
  });

  it("offers game-owned layout-group creation only in the Controller Layout Tool", () => {
    const api = fakeApi();
    const stageController = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api
    });
    const controllerController = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api
    });
    const markup = renderToStaticMarkup(
      <LayoutEditor
        stageController={stageController}
        controllerController={controllerController}
        initialMode="controller"
      />
    );

    expect(markup).toContain('data-layout-add-game-object="true"');
    expect(markup).toContain('data-layout-add-group="true"');
    expect(markup).toContain("Add Game Layout");
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
    const stageController = createLayoutController({
      initialLayouts: stageLayouts,
      mode: "stage",
      api
    });
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
    const stageController = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api
    });
    const controllerController = createLayoutController({
      initialLayouts: controllerLayouts,
      mode: "controller",
      api
    });
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

  it("previews flat and nested Stage renderer collections from their own manifests", () => {
    const api = fakeApi();
    const stageLayouts = layouts();
    stageLayouts.states.push({
      id: "renderer-preview",
      name: "Renderer Preview",
      elements: [
        {
          id: "flat-cards",
          name: "Flat Cards",
          kind: "collection",
          x: 1250,
          y: 260,
          width: 540,
          height: 160,
          collectionDirection: "horizontal",
          collectionAlignment: "center"
        } as never,
        {
          id: "player-rows",
          name: "Player Rows",
          kind: "collection",
          x: 700,
          y: 600,
          width: 700,
          height: 380,
          collectionDirection: "vertical",
          collectionAlignment: "center"
        } as never
      ]
    });
    const stageController = createLayoutController({
      initialLayouts: stageLayouts,
      mode: "stage",
      api
    });
    stageController.selectGroup("renderer-preview");
    const controllerController = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api
    });
    const card = {
      id: "preview-card",
      name: "Preview Card",
      surface: "stage",
      compositionKind: "gameObject",
      canvas: { width: 100, height: 140 },
      components: [{
        id: "label",
        name: "Label",
        kind: "text",
        x: 50,
        y: 70,
        width: 80,
        height: 40,
        defaultText: "CARD"
      }]
    } as ArtComposition;
    const row = {
      id: "preview-row",
      name: "Preview Row",
      surface: "stage",
      compositionKind: "gameObject",
      canvas: { width: 600, height: 150 },
      components: [{
        id: "cards-slot",
        name: "Cards Slot",
        kind: "container",
        childDistribution: "horizontal",
        x: 300,
        y: 75,
        width: 580,
        height: 140,
        children: []
      }]
    } as ArtComposition;
    const cardBindings = [
      {
        id: "label",
        kind: "text",
        source: "label",
        targetComponentId: "label",
        fallback: "PREVIEW CARD"
      }
    ];
    const markup = renderToStaticMarkup(
      <LayoutEditor
        artCompositions={[card, row]}
        stageController={stageController}
        controllerController={controllerController}
        gamePluginRenderers={[
          {
            id: "fixture.flat",
            surface: "stage",
            target: { layoutElementId: "flat-cards" },
            bindings: [{
              id: "cards",
              kind: "collection",
              source: "cards",
              item: {
                keySource: "id",
                artCompositionId: "preview-card",
                bindings: cardBindings
              }
            }]
          },
          {
            id: "fixture.rows",
            surface: "stage",
            target: { layoutElementId: "player-rows" },
            bindings: [{
              id: "rows",
              kind: "collection",
              source: "rows",
              item: {
                keySource: "id",
                artCompositionId: "preview-row",
                bindings: [{
                  id: "cards",
                  kind: "collection",
                  source: "cards",
                  targetComponentId: "cards-slot",
                  item: {
                    keySource: "id",
                    artCompositionId: "preview-card",
                    bindings: cardBindings
                  }
                }]
              }
            }]
          }
        ]}
      />
    );

    expect(markup.match(/data-layout-renderer-collection-preview="true"/g)).toHaveLength(2);
    expect(markup).toContain('data-layout-renderer-nested-collection-preview="cards"');
    expect(markup).toContain('data-layout-renderer-collection-preview-path="rows/preview-0/cards"');
    expect(markup).toContain("PREVIEW CARD");
    expect(markup).toContain('data-layout-react-component="state-list"');
    expect(markup).not.toContain("data-layout-element-preview-error");
  });

  it("preserves Controller choiceCollection sample labels", () => {
    const api = fakeApi();
    const controllerLayouts = layouts();
    controllerLayouts.states.push({
      id: "dynamic-choice",
      name: "Dynamic Choice",
      elements: [{
        id: "choice-host",
        name: "Choice Host",
        kind: "collection",
        x: 195,
        y: 420,
        width: 330,
        height: 400,
        collectionDirection: "vertical",
        collectionAlignment: "stretch"
      } as never]
    });
    const controllerController = createLayoutController({
      initialLayouts: controllerLayouts,
      mode: "controller",
      api
    });
    controllerController.selectGroup("dynamic-choice");
    const stageController = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api
    });
    const markup = renderToStaticMarkup(
      <LayoutEditor
        initialMode="controller"
        artCompositions={[{
          id: "choice-item",
          name: "Choice Item",
          surface: "controller",
          compositionKind: "gameObject",
          canvas: { width: 300, height: 80 },
          components: [{
            id: "label",
            name: "Label",
            kind: "text",
            x: 150,
            y: 40,
            width: 260,
            height: 50,
            defaultText: "OPTION"
          }]
        } as ArtComposition]}
        stageController={stageController}
        controllerController={controllerController}
        gamePluginInputs={[{
          controller: {
            bindings: [{
              kind: "choiceCollection",
              layoutElementId: "choice-host",
              item: {
                artCompositionId: "choice-item",
                targetComponentId: "label"
              }
            }]
          }
        }]}
      />
    );

    expect(markup.match(/data-layout-choice-collection-preview-item="true"/g)).toHaveLength(3);
    expect(markup).toContain("A realistic long private option label");
    expect(markup).not.toContain("data-layout-renderer-collection-preview-item");
  });
});
