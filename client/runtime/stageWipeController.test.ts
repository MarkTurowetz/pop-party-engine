import { describe, expect, it, vi } from "vitest";
import { PartyGameStageWipe } from "./stageWipeController";

describe("PartyGameStageWipe (ported wipe-controller)", () => {
  it("createController returns a controller with the wipe surface", () => {
    const controller = PartyGameStageWipe.createController({});
    expect(controller.transition).toBeTypeOf("function");
    expect(controller.cancel).toBeTypeOf("function");
    expect(controller.setShown).toBeTypeOf("function");
  });

  it("setShown returns 0 without authored art", () => {
    const controller = PartyGameStageWipe.createController({});
    expect(controller.setShown(true)).toBe(0);
  });

  it("completes Hide immediately while the wipe is already Off without rendering art", () => {
    const complete = vi.fn();
    const renderArt = vi.fn();
    const controller = PartyGameStageWipe.createController({ renderArt });

    expect(controller.setShownForAction({ isShown: false }, { actionKey: "wipe-off", complete })).toBe(0);
    expect(renderArt).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("waits for the Wipe Widget MC parent callback", () => {
    let timelineComplete: (() => void) | undefined;
    const complete = vi.fn();
    const playAll = vi.fn((animation: string, options: { complete?: () => void }) => {
      timelineComplete = options.complete;
      return animation === "Appear" ? 667 : 0;
    });
    const controller = PartyGameStageWipe.createController({ renderArt: () => ({ renderer: { playAll } }) });

    expect(controller.setShownForAction({ isShown: true }, { actionKey: "wipe-on", complete })).toBe(667);
    expect(playAll).toHaveBeenCalledWith("Appear", expect.objectContaining({ instant: false }));
    expect(complete).not.toHaveBeenCalled();

    timelineComplete?.();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("plays Disappear and completes only from its authored parent timeline", () => {
    let timelineComplete: (() => void) | undefined;
    const complete = vi.fn();
    const playAll = vi.fn((animation: string, options: { complete?: () => void }) => {
      timelineComplete = options.complete;
      return 667;
    });
    const controller = PartyGameStageWipe.createController({ renderArt: () => ({ renderer: { playAll } }) });
    controller.setShown(true, { instant: true });

    expect(controller.setShownForAction({ isShown: false }, { actionKey: "wipe-off", complete })).toBe(667);
    expect(playAll).toHaveBeenLastCalledWith("Disappear", expect.objectContaining({ instant: false }));
    expect(complete).not.toHaveBeenCalled();

    timelineComplete?.();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("starts Disappear only after transition Appear calls back", () => {
    const callbacks: Array<() => void> = [];
    const onCovered = vi.fn();
    const playAll = vi.fn((_animation: string, options: { complete?: () => void }) => {
      if (options.complete) callbacks.push(options.complete);
      return 667;
    });
    const controller = PartyGameStageWipe.createController({ renderArt: () => ({ renderer: { playAll } }) });

    controller.transition(onCovered);
    expect(playAll.mock.calls.map(([animation]) => animation)).toEqual(["Appear"]);
    expect(onCovered).not.toHaveBeenCalled();

    callbacks[0]();
    expect(onCovered).toHaveBeenCalledOnce();
    expect(playAll.mock.calls.map(([animation]) => animation)).toEqual(["Appear", "Disappear"]);
  });

  it("motionDuration honors the instant flag", () => {
    const controller = PartyGameStageWipe.createController({});
    expect(controller.motionDuration(true)).toBe(0);
    expect(controller.motionDuration(false)).toBeGreaterThan(0);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageWipe?: unknown };
    expect(host.PartyGameStageWipe).toBeTypeOf("object");
  });
});
