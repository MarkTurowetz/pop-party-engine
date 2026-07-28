import { describe, expect, it, vi } from "vitest";
import { createHostAudioController } from "./hostAudioController";
import type { HostAudioApi } from "../../api/hostAudioApi";
import type { HostAudios, HostAudiosSaveResponse } from "../../types/game-data";

function fakeApi(overrides: Partial<HostAudioApi> = {}): HostAudioApi {
  return {
    loadHostAudios: vi.fn(),
    saveHostAudios: vi.fn(
      async (hostAudios: HostAudios) =>
        ({ ok: true, hostAudios, storage: {} }) as unknown as HostAudiosSaveResponse
    ),
    ...overrides
  } as HostAudioApi;
}

const initial: HostAudios = {
  hostAudios: [{ id: "intro", name: "Intro", lines: [{ id: "l1", text: "Hello", url: "a.mp3" }] }]
};

describe("createHostAudioController", () => {
  it("starts clean and normalized", () => {
    const controller = createHostAudioController({ initialHostAudios: initial, api: fakeApi() });
    const state = controller.getState();
    expect(state.dirty).toBe(false);
    expect(state.hostAudios.hostAudios).toHaveLength(1);
    expect(state.hostAudios.hostAudios[0].lines[0].text).toBe("Hello");
  });

  it("adds/renames/removes sets and marks dirty + undo", () => {
    const controller = createHostAudioController({ initialHostAudios: initial, api: fakeApi() });
    controller.addSet();
    expect(controller.getState().hostAudios.hostAudios).toHaveLength(2);
    expect(controller.getState().dirty).toBe(true);
    controller.renameSet(1, "Outro");
    expect(controller.getState().hostAudios.hostAudios[1].name).toBe("Outro");
    controller.undo();
    expect(controller.getState().hostAudios.hostAudios[1].name).toBe("Host Audio 2");
  });

  it("adds, edits, and removes lines", () => {
    const controller = createHostAudioController({ initialHostAudios: initial, api: fakeApi() });
    controller.addLine(0);
    expect(controller.getState().hostAudios.hostAudios[0].lines).toHaveLength(2);
    controller.updateLine(0, 1, { text: "Bye", url: "b.mp3" });
    const line = controller.getState().hostAudios.hostAudios[0].lines[1];
    expect(line.text).toBe("Bye");
    expect(line.url).toBe("b.mp3");
    controller.removeLine(0, 1);
    expect(controller.getState().hostAudios.hostAudios[0].lines).toHaveLength(1);
  });

  it("removes a line when its audio URL is cleared", () => {
    const controller = createHostAudioController({ initialHostAudios: initial, api: fakeApi() });

    controller.updateLine(0, 0, { url: "" });

    expect(controller.getState().hostAudios.hostAudios[0].lines).toHaveLength(0);
    expect(controller.getState().dirty).toBe(true);
  });

  it("saves and clears dirty", async () => {
    const api = fakeApi();
    const controller = createHostAudioController({ initialHostAudios: initial, api });
    controller.renameSet(0, "Changed");
    const saved = await controller.save();
    expect(api.saveHostAudios).toHaveBeenCalledTimes(1);
    expect(saved?.hostAudios[0].name).toBe("Changed");
    expect(controller.getState().dirty).toBe(false);
  });

  it("accepts an atomic workspace save without reloading", () => {
    const controller = createHostAudioController({ initialHostAudios: initial, api: fakeApi() });
    controller.renameSet(0, "Committed");

    controller.acceptWorkspaceSave();

    expect(controller.getState().dirty).toBe(false);
  });

  it("reverts to the last saved snapshot", () => {
    const controller = createHostAudioController({ initialHostAudios: initial, api: fakeApi() });
    controller.addSet();
    controller.revert();
    expect(controller.getState().hostAudios.hostAudios).toHaveLength(1);
    expect(controller.getState().dirty).toBe(false);
  });

  it("publishes unsaved edits as a session draft and clears when clean", async () => {
    vi.useFakeTimers();
    try {
      const postDraft = vi.fn(async (message) => message);
      const controller = createHostAudioController({
        initialHostAudios: initial,
        api: fakeApi(),
        postDraft,
        draftPublishDelayMs: 1
      });

      controller.renameSet(0, "Changed");
      await vi.advanceTimersByTimeAsync(1);
      expect(postDraft).toHaveBeenLastCalledWith({
        hostAudios: expect.objectContaining({
          hostAudios: [expect.objectContaining({ name: "Changed" })]
        })
      });

      controller.undo();
      await vi.advanceTimersByTimeAsync(1);
      expect(postDraft).toHaveBeenLastCalledWith({ clearHostAudios: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
