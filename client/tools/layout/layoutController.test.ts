import { describe, expect, it, vi } from "vitest";
import { createLayoutController } from "./layoutController";
import type { LayoutApi } from "../../api/layoutApi";
import type {
  ArtComposition,
  LayoutSaveResponse,
  StageLayoutCollection
} from "../../types/game-data";

function layouts(): StageLayoutCollection {
  return {
    canvas: { width: 1920, height: 1080 },
    global: { id: "global", name: "Global", elements: [] },
    states: [
      {
        id: "intro",
        name: "Intro",
        elements: [{ id: "e1", name: "E1", kind: "text", x: 0, y: 0 } as never]
      }
    ]
  };
}

function fakeApi(overrides: Partial<LayoutApi> = {}): LayoutApi {
  return {
    loadStageLayouts: vi.fn(),
    saveStageLayouts: vi.fn(
      async (l: StageLayoutCollection) =>
        ({
          ok: true,
          layouts: l,
          storage: {}
        }) as unknown as LayoutSaveResponse<StageLayoutCollection>
    ),
    loadControllerLayouts: vi.fn(),
    saveControllerLayouts: vi.fn(),
    ...overrides
  } as LayoutApi;
}

function gameObject(overrides: Partial<ArtComposition> = {}): ArtComposition {
  return {
    id: "score-card",
    name: "Score Card",
    surface: "stage",
    compositionKind: "gameObject",
    canvas: { width: 320, height: 180 },
    components: [],
    ...overrides
  };
}

describe("createLayoutController", () => {
  it("starts clean with the global group selected", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    expect(controller.getState().dirty).toBe(false);
    expect(controller.getState().selectedGroupId).toBe("global");
  });

  it("adds a text element to the selected group, dirty + undo", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.addTextElement();
    const intro = controller.getState().layouts.states[0];
    expect(intro.elements).toHaveLength(2);
    expect(controller.getState().dirty).toBe(true);
    controller.undo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(1);
  });

  it("adds an Art Manager Game Object with a unique stable id and authored bounds", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");

    expect(controller.addGameObject(gameObject())).toBe("score-card-instance");
    expect(controller.addGameObject(gameObject())).toBe("score-card-instance-2");

    const elements = controller.getState().layouts.states[0].elements as Array<
      Record<string, unknown>
    >;
    expect(elements.slice(1)).toEqual([
      expect.objectContaining({
        id: "score-card-instance",
        name: "Score Card",
        kind: "art",
        artCompositionId: "score-card",
        x: 960,
        y: 540,
        width: 320,
        height: 180,
        defaultAnimationState: "Off"
      }),
      expect.objectContaining({
        id: "score-card-instance-2",
        artCompositionId: "score-card"
      })
    ]);
    expect(controller.getState().selectedElementIds).toEqual(new Set(["score-card-instance-2"]));

    controller.undo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(2);
    controller.redo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(3);
  });

  it("authors a reusable Controller renderer collection with undo/redo", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    expect(controller.addChoiceCollection()).toBe("choice-collection");
    expect(controller.getState().layouts.states[0].elements[1]).toMatchObject({
      id: "choice-collection",
      kind: "collection",
      collectionDirection: "vertical",
      collectionGap: 16,
      collectionDistribution: "start",
      collectionAlignment: "stretch",
      collectionOverflow: "auto"
    });
    controller.undo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(1);
    controller.redo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(2);
  });

  it("authors renderer collections on Stage layouts", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    expect(controller.addChoiceCollection()).toBe("choice-collection");
    expect(controller.getState().layouts.global.elements[0]).toMatchObject({
      id: "choice-collection",
      name: "Renderer Collection",
      kind: "collection",
      width: 900,
      height: 420
    });
  });

  it("rejects prefabs and Game Objects from the other layout surface", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });

    expect(controller.addGameObject(gameObject({ compositionKind: "prefab" }))).toBeNull();
    expect(controller.addGameObject(gameObject({ surface: "controller" }))).toBeNull();
    expect(controller.getState().layouts.global.elements).toHaveLength(0);
    expect(controller.getState().error).toMatch(/valid Art Manager Game Object/);
  });

  it("creates game-owned controller layout groups with normalized unique ids and undo/redo", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api: fakeApi()
    });

    expect(controller.addLayoutGroup({ id: "flip7 wager", name: "Flip 7 Wager" })).toBe(
      "flip7-wager"
    );
    expect(controller.addLayoutGroup({ id: "flip7-wager", name: "Another Wager" })).toBe(
      "flip7-wager-2"
    );
    expect(controller.getState().selectedGroupId).toBe("flip7-wager-2");
    expect(controller.getState().layouts.states.slice(-2)).toEqual([
      expect.objectContaining({ id: "flip7-wager", name: "Flip 7 Wager", elements: [] }),
      expect.objectContaining({ id: "flip7-wager-2", name: "Another Wager", elements: [] })
    ]);

    controller.undo();
    expect(controller.getState().layouts.states.some((state) => state.id === "flip7-wager-2")).toBe(
      false
    );
    expect(controller.getState().selectedGroupId).toBe("global");
    controller.redo();
    expect(controller.getState().layouts.states.some((state) => state.id === "flip7-wager-2")).toBe(
      true
    );
  });

  it("authors persistent layers with z-order and per-state show/hide through history", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api: fakeApi()
    });

    expect(
      controller.addPersistentLayer({ id: "Round Context", name: "Round Context", zIndex: 150 })
    ).toBe("round-context");
    controller.updatePersistentLayer("round-context", { zIndex: 175 });
    controller.setPersistentLayerVisible("intro", "round-context", false);
    expect(controller.getState().layouts.layers).toEqual([
      expect.objectContaining({ id: "round-context", zIndex: 175 })
    ]);
    expect(controller.getState().layouts.states[0].hiddenLayers).toEqual(["round-context"]);
    controller.undo();
    expect(controller.getState().layouts.states[0].hiddenLayers).toEqual(undefined);
    controller.redo();
    expect(controller.getState().layouts.states[0].hiddenLayers).toEqual(["round-context"]);
  });

  it("keeps Stage layout groups Flow-owned", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });

    expect(controller.addLayoutGroup({ id: "orphan", name: "Orphan" })).toBeNull();
    expect(controller.getState().layouts.states).toHaveLength(1);
    expect(controller.getState().error).toMatch(/Flow Tool/);
  });

  it("redoes an undone layout edit", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.addTextElement();
    controller.undo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(1);
    expect(controller.getState().canRedo).toBe(true);

    controller.redo();
    expect(controller.getState().layouts.states[0].elements).toHaveLength(2);
  });

  it("updates and moves an element", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.updateElement("e1", { name: "Renamed" } as never);
    controller.moveElement("e1", 12.345, 6.789);
    const el = controller.getState().layouts.states[0].elements[0] as Record<string, unknown>;
    expect(el.name).toBe("Renamed");
    expect(el.x).toBe(12.345);
  });

  it("moves and edits a multi-selection in one history transaction", () => {
    const source = layouts();
    source.states[0].elements.push({ id: "e2", name: "E2", kind: "art", x: 10, y: 20 } as never);
    const controller = createLayoutController({
      initialLayouts: source,
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.setElementSelection(["e1", "e2"]);
    controller.moveElements({ e1: { x: 5, y: 6 }, e2: { x: 15, y: 26 } });
    controller.adjustElements(["e1", "e2"], "width", 12);
    controller.updateElements(["e1", "e2"], { defaultAnimationState: "Off" });

    expect(controller.getState().layouts.states[0].elements).toEqual([
      expect.objectContaining({ id: "e1", x: 5, y: 6, width: 12, defaultAnimationState: "Off" }),
      expect.objectContaining({ id: "e2", x: 15, y: 26, width: 12, defaultAnimationState: "Off" })
    ]);
    controller.undo();
    expect(
      controller.getState().layouts.states[0].elements[0].defaultAnimationState
    ).toBeUndefined();
    controller.undo();
    expect(controller.getState().layouts.states[0].elements[0].width).toBeUndefined();
    controller.undo();
    expect(controller.getState().layouts.states[0].elements).toEqual([
      expect.objectContaining({ id: "e1", x: 0, y: 0 }),
      expect.objectContaining({ id: "e2", x: 10, y: 20 })
    ]);
  });

  it("reorders elements in the selected group", () => {
    const controller = createLayoutController({
      initialLayouts: {
        ...layouts(),
        states: [
          {
            id: "intro",
            name: "Intro",
            elements: [
              { id: "a", name: "A", kind: "art" } as never,
              { id: "b", name: "B", kind: "art" } as never,
              { id: "c", name: "C", kind: "art" } as never
            ]
          }
        ]
      },
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.reorderElement("c", "a", "before");
    expect(controller.getState().layouts.states[0].elements.map((element) => element.id)).toEqual([
      "c",
      "a",
      "b"
    ]);
    expect(
      controller.getState().layouts.states[0].elements.map((element) => element.zIndex)
    ).toEqual([2, 1, 0]);
  });

  it("stores hidden and locked layout element state", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.updateElement("e1", { hidden: true, locked: true } as never);
    const el = controller.getState().layouts.states[0].elements[0] as Record<string, unknown>;
    expect(el.hidden).toBe(true);
    expect(el.locked).toBe(true);
    expect(controller.getState().dirty).toBe(true);
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

  it("accepts an atomic workspace save without reloading", () => {
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "stage",
      api: fakeApi()
    });
    controller.selectGroup("intro");
    controller.addTextElement();

    controller.acceptWorkspaceSave();

    expect(controller.getState().dirty).toBe(false);
  });

  it("saves controller configuration tags and clears dirty", async () => {
    const saveControllerLayouts = vi.fn(
      async (nextLayouts: StageLayoutCollection) =>
        ({
          ok: true,
          layouts: nextLayouts,
          storage: {}
        }) as unknown as LayoutSaveResponse<StageLayoutCollection>
    );
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api: fakeApi({ saveControllerLayouts })
    });
    controller.selectGroup("intro");
    controller.updateElement("e1", { tags: ["Phase One", "Review"] });

    expect(await controller.save()).toBe(true);
    expect(saveControllerLayouts).toHaveBeenCalledWith(
      expect.objectContaining({
        states: [
          expect.objectContaining({
            elements: [expect.objectContaining({ tags: ["Phase One", "Review"] })]
          })
        ]
      })
    );
    expect(controller.getState().dirty).toBe(false);
  });

  it("durably saves a game-owned controller group and its Art Manager composition reference", async () => {
    const saveControllerLayouts = vi.fn(
      async (nextLayouts: StageLayoutCollection) =>
        ({
          ok: true,
          layouts: nextLayouts,
          storage: {}
        }) as unknown as LayoutSaveResponse<StageLayoutCollection>
    );
    const controller = createLayoutController({
      initialLayouts: layouts(),
      mode: "controller",
      api: fakeApi({ saveControllerLayouts })
    });
    controller.addLayoutGroup({ id: "private-offer", name: "Private Offer" });
    controller.addGameObject(
      gameObject({
        id: "private-offer-controls",
        name: "Private Offer Controls",
        surface: "controller",
        canvas: { width: 360, height: 240 }
      })
    );

    expect(await controller.save()).toBe(true);
    expect(saveControllerLayouts).toHaveBeenCalledWith(
      expect.objectContaining({
        states: expect.arrayContaining([
          expect.objectContaining({
            id: "private-offer",
            elements: [
              expect.objectContaining({
                id: "private-offer-controls-instance",
                artCompositionId: "private-offer-controls",
                width: 360,
                height: 240
              })
            ]
          })
        ])
      })
    );
    expect(controller.getState().dirty).toBe(false);
  });

  it("publishes stage layout edits as session drafts", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createLayoutController({
        initialLayouts: layouts(),
        mode: "stage",
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });
      controller.selectGroup("intro");

      controller.moveElement("e1", 12, 6);
      await vi.advanceTimersByTimeAsync(1);

      expect(postDraft).toHaveBeenLastCalledWith({
        layouts: expect.objectContaining({
          states: [
            expect.objectContaining({ elements: [expect.objectContaining({ x: 12, y: 6 })] })
          ]
        })
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes controller layout edits under the controller draft key", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createLayoutController({
        initialLayouts: layouts(),
        mode: "controller",
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });
      controller.selectGroup("intro");

      controller.moveElement("e1", 20, 8);
      await vi.advanceTimersByTimeAsync(1);

      expect(postDraft).toHaveBeenLastCalledWith({
        controllerLayouts: expect.objectContaining({
          states: [
            expect.objectContaining({ elements: [expect.objectContaining({ x: 20, y: 8 })] })
          ]
        })
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes new controller groups and Game Objects through the live-prototype draft", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createLayoutController({
        initialLayouts: layouts(),
        mode: "controller",
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });

      controller.addLayoutGroup({ id: "current-player-turn", name: "Current Player Turn" });
      controller.addGameObject(
        gameObject({
          id: "turn-controls",
          surface: "controller",
          canvas: { width: 340, height: 120 }
        })
      );
      await vi.advanceTimersByTimeAsync(1);

      expect(postDraft).toHaveBeenLastCalledWith({
        controllerLayouts: expect.objectContaining({
          states: expect.arrayContaining([
            expect.objectContaining({
              id: "current-player-turn",
              elements: [
                expect.objectContaining({
                  id: "turn-controls-instance",
                  artCompositionId: "turn-controls"
                })
              ]
            })
          ])
        })
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
