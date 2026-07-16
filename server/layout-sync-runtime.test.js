import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLayoutSyncRuntime } = require("./layout-sync-runtime");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runtime() {
  return createLayoutSyncRuntime({
    createControllerInputLayoutStates: () => [
      { id: "controller-presentation", name: "Presentation", elements: [{ id: "presentation" }] },
      { id: "controller-voice-input", name: "Voice Input", elements: [{ id: "voice" }] }
    ],
    createLayoutStateForFlowState: (state) => ({ id: state.id, name: state.name, elements: [] }),
    dedupeLayoutElements: (elements) => [...new Map((elements || []).map((element) => [element.id, element])).values()],
    normalizeControllerLayouts: clone,
    normalizeGameFlow: clone,
    normalizeLayoutState: clone,
    normalizeStageLayouts: clone,
    readGameFlow: () => ({ states: [], routeNodes: [] })
  });
}

function layouts() {
  return {
    canvas: { width: 390, height: 844 },
    global: { id: "global", name: "Global", elements: [] },
    states: [
      { id: "join", name: "Join", elements: [] },
      { id: "lobby", name: "Lobby", elements: [] },
      { id: "intro", name: "Game Intro", elements: [] },
      { id: "voice-moment", name: "Voice Moment", elements: [] },
      { id: "controller-presentation", name: "Presentation", elements: [] },
      { id: "custom-used", name: "Custom Used", elements: [] },
      { id: "route-used", name: "Route Used", elements: [] },
      { id: "custom-unused", name: "Custom Unused", elements: [] }
    ]
  };
}

describe("controller layout syncing", () => {
  it("keeps only Join, Lobby, semantic layouts, and layouts explicitly referenced by the flow", () => {
    const flow = {
      states: [
        {
          id: "voice-moment",
          name: "Voice Moment",
          actions: [
            {
              id: "subroutine",
              type: "subroutine",
              actions: [{ id: "custom", type: "setControllerLayout", controllerLayoutId: "custom-used" }]
            }
          ]
        }
      ],
      routeNodes: [
        {
          id: "route-layout",
          routeNodeType: "action",
          type: "setControllerLayout",
          controllerLayoutId: "route-used"
        }
      ]
    };

    const synced = runtime().syncControllerLayoutsWithFlow(layouts(), flow);

    expect(synced.states.map((state) => state.id)).toEqual([
      "join",
      "lobby",
      "controller-presentation",
      "custom-used",
      "route-used",
      "controller-voice-input"
    ]);
  });

  it("does not recreate controller layouts for ordinary stage moment ids", () => {
    const synced = runtime().syncControllerLayoutsWithFlow(layouts(), {
      states: [{ id: "voice-moment", name: "Voice Moment", actions: [] }],
      routeNodes: []
    });

    expect(synced.states.map((state) => state.id)).toEqual([
      "join",
      "lobby",
      "controller-presentation",
      "controller-voice-input"
    ]);
  });
});
