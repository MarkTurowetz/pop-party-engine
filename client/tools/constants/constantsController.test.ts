import { describe, expect, it, vi } from "vitest";
import { createConstantsController } from "./constantsController";
import type { ConstantsApi } from "../../api/constantsApi";
import type { GameConstants, GameConstantsSaveResponse } from "../../types/game-data";

function fakeApi(overrides: Partial<ConstantsApi> = {}): ConstantsApi {
  return {
    loadGameConstants: vi.fn(),
    saveGameConstants: vi.fn(
      async (constants: GameConstants) => ({ ok: true, constants, storage: {} }) as unknown as GameConstantsSaveResponse
    ),
    ...overrides
  } as ConstantsApi;
}

const initial: GameConstants = { gameTitle: "Test", numberOfRounds: 3 };

describe("createConstantsController", () => {
  it("starts clean and normalized", () => {
    const controller = createConstantsController({ initialConstants: initial, api: fakeApi() });
    const state = controller.getState();
    expect(state.dirty).toBe(false);
    expect(state.constants.gameTitle).toBe("Test");
    expect(state.constants.numberOfRounds).toBe(3);
  });

  it("edits a built-in constant and marks dirty, then undoes", () => {
    const controller = createConstantsController({ initialConstants: initial, api: fakeApi() });
    controller.setConstant("numberOfRounds", 5);
    expect(controller.getState().constants.numberOfRounds).toBe(5);
    expect(controller.getState().dirty).toBe(true);
    controller.undo();
    expect(controller.getState().constants.numberOfRounds).toBe(3);
    expect(controller.getState().dirty).toBe(false);
  });

  it("adds, edits, and removes custom constants", () => {
    const controller = createConstantsController({ initialConstants: initial, api: fakeApi() });
    controller.addCustomConstant();
    expect(controller.getState().constants.customConstants).toHaveLength(1);
    controller.updateCustomConstant(0, { type: "int", value: 7, name: "Lives" });
    const c = controller.getState().constants.customConstants[0];
    expect(c.type).toBe("int");
    expect(c.value).toBe(7);
    controller.removeCustomConstant(0);
    expect(controller.getState().constants.customConstants).toHaveLength(0);
  });

  it("edits and adds player colors", () => {
    const controller = createConstantsController({ initialConstants: initial, api: fakeApi() });
    const before = controller.getState().constants.playerColors.length;
    controller.addPlayerColor();
    expect(controller.getState().constants.playerColors).toHaveLength(before + 1);
    controller.setPlayerColor(0, "#000000");
    expect(controller.getState().constants.playerColors[0]).toBe("#000000");
  });

  it("saves and clears dirty", async () => {
    const api = fakeApi();
    const controller = createConstantsController({ initialConstants: initial, api });
    controller.setConstant("numberOfRounds", 9);
    const saved = await controller.save();
    expect(api.saveGameConstants).toHaveBeenCalledTimes(1);
    expect(saved?.numberOfRounds).toBe(9);
    expect(controller.getState().dirty).toBe(false);
  });

  it("reverts to the last saved snapshot", () => {
    const controller = createConstantsController({ initialConstants: initial, api: fakeApi() });
    controller.setConstant("gameTitle", "Changed");
    controller.revert();
    expect(controller.getState().constants.gameTitle).toBe("Test");
    expect(controller.getState().dirty).toBe(false);
  });

  it("publishes unsaved edits as a session draft and clears when clean", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createConstantsController({
        initialConstants: initial,
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });

      controller.setConstant("gameTitle", "Changed");
      await vi.advanceTimersByTimeAsync(1);
      expect(postDraft).toHaveBeenLastCalledWith({
        constants: expect.objectContaining({ gameTitle: "Changed" })
      });

      controller.undo();
      await vi.advanceTimersByTimeAsync(1);
      expect(postDraft).toHaveBeenLastCalledWith({ clearConstants: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
