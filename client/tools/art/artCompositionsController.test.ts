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

  it("adds a component to the root, marks dirty, undoes", () => {
    const controller = createArtCompositionsController({ initialCompositions: [composition("a")], api: fakeApi() });
    controller.addComponent("shape");
    expect(controller.getState().compositions[0].components).toHaveLength(1);
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
