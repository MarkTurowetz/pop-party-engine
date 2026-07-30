import { describe, expect, it, vi } from "vitest";
import { gamePluginActionRunnerDefinitions, renderGamePluginSurface } from "./gamePluginRendererRuntime";

describe("game plugin renderer runtime", () => {
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
});
