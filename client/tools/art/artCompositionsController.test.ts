import { describe, expect, it, vi } from "vitest";
import { createArtCompositionsController } from "./artCompositionsController";
import type { ArtApi } from "../../api/artApi";
import type { ArtComposition, ArtCompositionSaveResponse } from "../../types/game-data";

function composition(id: string): ArtComposition {
  return { id, name: id, surface: "stage", canvas: { width: 560, height: 230 }, components: [] };
}

function fakeApi(overrides: Partial<ArtApi> = {}): ArtApi {
  return {
    loadArtAssets: vi.fn(),
    saveArtComposition: vi.fn(
      async (_id: string, comp: ArtComposition) => ({ ok: true, composition: comp }) as unknown as ArtCompositionSaveResponse
    ),
    saveArtOrganization: vi.fn(),
    deleteArtComposition: vi.fn(),
    replaceArtAsset: vi.fn(),
    ...overrides
  } as ArtApi;
}

describe("createArtCompositionsController", () => {
  it("starts clean with first composition selected", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a"), composition("b")], api: fakeApi() });
    const state = controller.getState();
    expect(state.dirty).toBe(false);
    expect(state.selectedCompositionId).toBe("a");
  });

  it("creates a top-level prefab composition as an undoable local edit", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });

    const created = controller.createComposition("prefab", "stage", "Answer Bubble");

    expect(created.id).toBe("prefab-answer-bubble");
    expect(created.compositionKind).toBe("prefab");
    expect(created.timeline?.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["park", "on", "appear", "update", "disappear"]));
    expect(controller.getState().selectedCompositionId).toBe(created.id);
    expect(controller.getState().dirtyCompositionIds.has(created.id)).toBe(true);

    controller.undo();

    expect(controller.getState().compositions.some((item) => item.id === created.id)).toBe(false);
    expect(controller.getState().selectedCompositionId).toBe("a");
  });

  it("adds a component to the root, marks dirty, undoes", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("shape");
    expect(controller.getState().compositions[0].components).toHaveLength(1);
    expect(controller.getState().compositions[0].components[0].timeline?.labels.map((label) => label.name)).toEqual(
      expect.arrayContaining(["park", "on", "appear", "update", "disappear"])
    );
    expect(controller.getState().compositions[0].components[0].timeline?.tracks[0].targetId).toBe(
      controller.getState().compositions[0].components[0].id
    );
    expect(controller.getState().dirty).toBe(true);
    expect(controller.getState().dirtyCompositionIds.has("a")).toBe(true);
    controller.undo();
    expect(controller.getState().compositions[0].components).toHaveLength(0);
    expect(controller.getState().dirty).toBe(false);
  });

  it("nests a component into a selected container", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("container");
    const containerId = controller.getState().compositions[0].components[0].id;
    controller.selectComponent(containerId);
    controller.addComponent("text");
    const container = controller.getState().compositions[0].components[0];
    expect(container.children).toHaveLength(1);
    expect(container.children?.[0].kind).toBe("text");
    expect(container.children?.[0].timeline?.labels.map((label) => label.name)).toEqual(
      expect.arrayContaining(["park", "on", "appear", "update", "disappear"])
    );
  });

  it("adds a prefab reference component with the referenced composition dimensions", () => {
    const prefab = composition("answer-bubble");
    prefab.name = "Answer Bubble";
    prefab.compositionKind = "prefab";
    prefab.canvas = { width: 300, height: 180 };
    const host = composition("host");
    const controller = createArtCompositionsController({ initialCompositions: [host, prefab], api: fakeApi() });

    controller.addComponent("reference");

    const reference = controller.getState().compositions[0].components[0];
    expect(reference.kind).toBe("reference");
    expect(reference.artCompositionId).toBe("answer-bubble");
    expect(reference.name).toBe("Answer Bubble");
    expect(reference.width).toBe(300);
    expect(reference.height).toBe(180);
    expect(reference.timeline?.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["park", "on", "appear", "update", "disappear"]));
  });

  it("refreshes reference overrides when the referenced prefab changes", () => {
    const first = composition("first");
    first.compositionKind = "prefab";
    first.canvas = { width: 100, height: 50 };
    const second = composition("second");
    second.name = "Second Prefab";
    second.compositionKind = "prefab";
    second.canvas = { width: 420, height: 210 };
    const controller = createArtCompositionsController({ initialCompositions: [composition("host"), first, second], api: fakeApi() });

    controller.addComponent("reference");
    const referenceId = controller.getState().compositions[0].components[0].id;
    controller.updateComponent(referenceId, { artCompositionId: "second" } as never);

    const reference = controller.getState().compositions[0].components[0];
    expect(reference.artCompositionId).toBe("second");
    expect(reference.name).toBe("Second Prefab");
    expect(reference.width).toBe(420);
    expect(reference.height).toBe(210);
  });

  it("updates a component property and removes it", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("shape");
    const id = controller.getState().compositions[0].components[0].id;
    controller.updateComponent(id, { name: "Renamed", fillColor: "#ff0000" } as never);
    expect(controller.getState().compositions[0].components[0].name).toBe("Renamed");
    controller.selectComponent(id);
    controller.removeSelectedComponents();
    expect(controller.getState().compositions[0].components).toHaveLength(0);
  });

  it("reorders root and nested component siblings with undo support", () => {
    const initial = composition("a");
    initial.components = [
      { id: "one", name: "One", kind: "shape" },
      {
        id: "group",
        name: "Group",
        kind: "container",
        children: [
          { id: "child-a", name: "Child A", kind: "shape" },
          { id: "child-b", name: "Child B", kind: "shape" },
          { id: "child-c", name: "Child C", kind: "shape" }
        ]
      },
      { id: "two", name: "Two", kind: "shape" }
    ] as never;
    const controller = createArtCompositionsController({ initialCompositions: [initial], api: fakeApi() });

    controller.reorderComponent("two", "one", "before");
    expect(controller.getState().compositions[0].components.map((component) => component.id)).toEqual(["two", "one", "group"]);

    controller.reorderComponent("child-c", "child-a", "after");
    expect(controller.getState().compositions[0].components[2].children?.map((component) => component.id)).toEqual([
      "child-a",
      "child-c",
      "child-b"
    ]);

    controller.reorderComponent("child-a", "one", "after");
    expect(controller.getState().compositions[0].components[2].children?.map((component) => component.id)).toEqual([
      "child-a",
      "child-c",
      "child-b"
    ]);

    controller.undo();
    expect(controller.getState().compositions[0].components[2].children?.map((component) => component.id)).toEqual([
      "child-a",
      "child-b",
      "child-c"
    ]);
  });

  it("persists component lock changes through save payloads", async () => {
    const api = fakeApi();
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api });
    controller.addComponent("shape");
    const id = controller.getState().compositions[0].components[0].id;
    controller.updateComponent(id, { locked: true } as never);

    await controller.save();

    expect(api.saveArtComposition).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({
        components: [expect.objectContaining({ id, locked: true })]
      })
    );
  });

  it("saves only dirty compositions and clears dirty", async () => {
    const api = fakeApi();
    const controller = createArtCompositionsController({ initialCompositions: [composition("a"), composition("b")], api });
    controller.addComponent("shape");
    const ok = await controller.save();
    expect(ok).toBe(true);
    expect(api.saveArtComposition).toHaveBeenCalledTimes(1);
    expect(api.saveArtComposition).toHaveBeenCalledWith("a", expect.anything());
    expect(controller.getState().dirty).toBe(false);
  });

  it("saves created composition metadata", async () => {
    const api = fakeApi();
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api });
    const created = controller.createComposition("gameObject", "controller", "Score Popup");

    await controller.save();

    expect(api.saveArtComposition).toHaveBeenCalledWith(
      created.id,
      expect.objectContaining({
        name: "Score Popup",
        surface: "controller",
        compositionKind: "gameObject",
        isCustom: true
      })
    );
  });

  it("publishes composition edits as a session draft", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createArtCompositionsController({
        initialCompositions: [composition("a")],
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });

      controller.addComponent("shape");
      await vi.advanceTimersByTimeAsync(1);

      expect(postDraft).toHaveBeenLastCalledWith({
        artCompositions: [expect.objectContaining({ id: "a", components: [expect.objectContaining({ kind: "shape" })] })]
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
