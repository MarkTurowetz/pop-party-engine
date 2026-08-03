import { describe, expect, it, vi } from "vitest";
import { collectionLayoutFromArtContainer, gamePluginActionRunnerDefinitions, renderGamePluginSurface } from "./gamePluginRendererRuntime";

describe("game plugin renderer runtime", () => {
  it("preserves authored Art container distribution for nested collections", () => {
    expect(collectionLayoutFromArtContainer({
      width: 500,
      height: 140,
      childDistribution: "horizontal"
    })).toMatchObject({
      collectionDirection: "horizontal",
      collectionDistribution: "space-evenly",
      collectionAlignment: "center"
    });
    expect(collectionLayoutFromArtContainer({
      width: 500,
      height: 140,
      childDistribution: "none"
    })).toMatchObject({ collectionDistribution: "start" });
  });
  const documentRef = {
    getElementById: (id: string) => id === "pop-party-runtime-config" ? {
      textContent: `{
        "gamePlugin": {
          "actionRunners": [{"actionId":"fixture.draw","type":"fixture.draw","runner":"serverEffect"}],
          "renderers": [{
            "id":"fixture.counter",
            "surface":"stage",
            "target":{"layoutElementId":"counter","layoutScope":"moment"},
            "bindings":[
              {"id":"text","kind":"text","source":"label","targetComponentId":"counter-text"},
              {"id":"tint","kind":"component","source":"tint","targetComponentId":"counter-shape","property":"fill"}
            ]
          }]
        }
      }`
    } : null
  } as unknown as Document;

  it("binds a live view model onto an authored layout element without changing its box", () => {
    const target = { dataset: {} } as HTMLElement;
    target.dataset.stageLayoutVisibilityKey = "moment:counter";
    const element = { id: "counter", kind: "art", artCompositionId: "fixture-counter", x: 100, y: 200 };
    const renderStageArtInstance = vi.fn();
    Object.assign(globalThis, {
      currentStageLayoutStateId: "play",
      stageLayoutState: () => ({ elements: [element] }),
      stageLayoutElementForId: () => element,
      stageLayoutTargetElement: () => target,
      renderStageArtInstance
    });

    renderGamePluginSurface("stage", {
      gamePlugin: { viewModels: { "fixture.counter": { label: "7", tint: "#ff0" } } }
    }, documentRef);

    expect(renderStageArtInstance).toHaveBeenCalledWith(element, target, "moment:counter", {
      textOverrides: { "counter-text": "7" },
      componentOverrides: { "counter-shape": { fill: "#ff0" } }
    });
    expect(element).toMatchObject({ x: 100, y: 200 });
    expect(gamePluginActionRunnerDefinitions(documentRef)).toEqual([
      { actionId: "fixture.draw", type: "fixture.draw", runner: "serverEffect" }
    ]);
  });

  it("targets a named persistent controller layer through its explicit scope", () => {
    const layerDocument = {
      getElementById: () => ({ textContent: JSON.stringify({ gamePlugin: { renderers: [{
        id: "fixture.context",
        surface: "controller",
        target: { layoutElementId: "round-context", layoutScope: "layer", layoutLayerId: "game-context" },
        bindings: [
          { id: "text", kind: "text", source: "label", targetComponentId: "text" },
          { id: "tint", kind: "component", source: "tint", targetComponentId: "avatar-sprite", property: "imageTint" },
          { id: "state", kind: "state", source: "state", targetComponentId: "avatar", playback: "stop" }
        ]
      }] } }) })
    } as unknown as Document;
    const element = { id: "round-context", kind: "art", artCompositionId: "round-context" };
    const target = { dataset: { controllerLayoutVisibilityKey: "layer:game-context:round-context" } } as unknown as HTMLElement;
    const controllerLayoutTargetByElementId = vi.fn(() => target);
    const stopAtComponent = vi.fn();
    const renderControllerArtInstance = vi.fn(() => ({ stopAtComponent }));
    Object.assign(globalThis, {
      controllerLayouts: { layers: [{ id: "game-context", elements: [element] }] },
      controllerLayoutTargetByElementId,
      renderControllerArtInstance
    });

    renderGamePluginSurface("controller", {
      gamePlugin: { viewModels: { "fixture.context": { label: "Round 4", tint: "#36c96b", state: "Stego" } } }
    }, layerDocument);

    expect(controllerLayoutTargetByElementId).toHaveBeenCalledWith("round-context", "layer:game-context");
    expect(renderControllerArtInstance).toHaveBeenCalledWith(
      element,
      target,
      "layer:game-context:round-context",
      {
        textOverrides: { text: "Round 4" },
        componentOverrides: { "avatar-sprite": { imageTint: "#36c96b" } }
      }
    );
    expect(stopAtComponent).toHaveBeenCalledWith("avatar", "Stego", { instant: true });
  });

});
