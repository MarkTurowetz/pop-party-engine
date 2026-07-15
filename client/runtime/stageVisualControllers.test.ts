import { describe, expect, it, vi } from "vitest";
import { PartyGameStageVisualControllers } from "./stageVisualControllers";

describe("PartyGameStageVisualControllers (ported)", () => {
  it("exposes the stage text and crafting timer controllers and factories", () => {
    expect(PartyGameStageVisualControllers.StageTextController).toBeTypeOf("function");
    expect(PartyGameStageVisualControllers.CraftingTimerController).toBeTypeOf("function");
    expect(PartyGameStageVisualControllers.createStageTextController({})).toBeTypeOf("object");
  });

  it("a stage text controller with no objects returns 0 from set()", () => {
    const controller = PartyGameStageVisualControllers.createStageTextController({});
    expect(controller.set("presentation", { text: "Hi" })).toBe(0);
  });

  it("a crafting timer with no element toggles nothing and returns 0", () => {
    const controller = PartyGameStageVisualControllers.createCraftingTimerController({});
    expect(controller.reset()).toBe(0);
  });

  it("completes Set Timer Shown only from the authored parent timeline callback", () => {
    let timelineComplete: (() => void) | undefined;
    const complete = vi.fn();
    const playAll = vi.fn((animation: string, options: { complete?: () => void }) => {
      timelineComplete = options.complete;
      return animation === "Appear" ? 333 : 500;
    });
    const element = {
      classList: { remove: vi.fn(), toggle: vi.fn() },
      dataset: {},
      style: { setProperty: vi.fn() },
      setAttribute: vi.fn()
    } as unknown as HTMLElement;
    const label = { dataset: {}, textContent: "" } as unknown as HTMLElement;
    const renderArt = vi.fn(() => ({ renderer: { playAll } }));
    const controller = PartyGameStageVisualControllers.createCraftingTimerController({
      element,
      label,
      renderArt,
      getRenderedActionKey: () => "crafting:timer-on",
      getCurrentStageState: () => ({
        craftingTimer: { shown: false, running: false, durationMs: 30000, remainingMs: 30000 }
      })
    });

    expect(controller.setShownForAction({ isShown: true }, { actionKey: "crafting:timer-on", complete })).toBe(333);
    expect(playAll).toHaveBeenCalledWith("Appear", expect.objectContaining({ instant: false }));
    expect(complete).not.toHaveBeenCalled();

    controller.render({ shown: true, running: false, durationMs: 30000, remainingMs: 30000 });
    expect(playAll).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();

    timelineComplete?.();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("uses the authored Disappear callback instead of the legacy host animation", () => {
    const callbacks: Array<() => void> = [];
    const complete = vi.fn();
    const playAll = vi.fn((_animation: string, options: { complete?: () => void }) => {
      if (options.complete) callbacks.push(options.complete);
      return 500;
    });
    const element = {
      classList: { remove: vi.fn(), toggle: vi.fn() },
      dataset: {},
      style: { setProperty: vi.fn() },
      setAttribute: vi.fn()
    } as unknown as HTMLElement;
    const label = { dataset: {}, textContent: "" } as unknown as HTMLElement;
    const controller = PartyGameStageVisualControllers.createCraftingTimerController({
      element,
      label,
      renderArt: () => ({ renderer: { playAll } }),
      getRenderedActionKey: () => "crafting:timer",
      getCurrentStageState: () => ({
        craftingTimer: { shown: true, running: false, durationMs: 30000, remainingMs: 30000 }
      })
    });

    controller.setVisible(true, { instant: true });
    callbacks.shift()?.();
    expect(controller.setShownForAction({ isShown: false }, { actionKey: "crafting:timer", complete })).toBe(500);
    expect(playAll).toHaveBeenLastCalledWith("Disappear", expect.objectContaining({ instant: false }));
    expect(complete).not.toHaveBeenCalled();

    callbacks.shift()?.();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageVisualControllers?: unknown };
    expect(host.PartyGameStageVisualControllers).toBeTypeOf("object");
  });
});
