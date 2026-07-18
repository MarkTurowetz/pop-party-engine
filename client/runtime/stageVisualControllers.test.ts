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

  it("resets countdown data without issuing a lifecycle command", () => {
    const playAll = vi.fn();
    const renderArt = vi.fn();
    const controller = PartyGameStageVisualControllers.createCraftingTimerController({
      renderArt: () => {
        renderArt();
        return { renderer: { playAll } };
      }
    });

    expect(controller.reset()).toBe(0);
    expect(renderArt).not.toHaveBeenCalled();
    expect(playAll).not.toHaveBeenCalled();
  });

  it("prepares Set Timer Shown data without commanding the widget lifecycle", () => {
    const playAll = vi.fn();
    const element = {
      style: { setProperty: vi.fn() }
    } as unknown as HTMLElement;
    const renderArt = vi.fn(() => ({ renderer: { playAll } }));
    const controller = PartyGameStageVisualControllers.createCraftingTimerController({
      element,
      renderArt,
      getRenderedActionKey: () => "crafting:timer-on",
      getCurrentStageState: () => ({
        craftingTimer: { shown: false, running: false, durationMs: 30000, remainingMs: 30000 }
      })
    });

    expect(controller.prepareShownForAction({ isShown: true }, { actionKey: "crafting:timer-on" })).toBe(0);
    expect(renderArt).toHaveBeenCalledWith(expect.objectContaining({
      label: "30",
      timer: expect.objectContaining({ shown: true, running: false })
    }));
    expect(element.style.setProperty).toHaveBeenCalledWith("--timer-progress", "1.0000");
    expect(playAll).not.toHaveBeenCalled();
  });

  it("updates only countdown content while the timer is running", () => {
    const playAll = vi.fn();
    const element = {
      style: { setProperty: vi.fn() }
    } as unknown as HTMLElement;
    const renderArt = vi.fn(() => ({ renderer: { playAll } }));
    const controller = PartyGameStageVisualControllers.createCraftingTimerController({
      element,
      renderArt,
      getCurrentStageState: () => ({ serverNow: 1000 })
    });

    controller.render({ shown: true, running: false, durationMs: 30000, remainingMs: 12000, serverNow: 1000 });
    expect(renderArt).toHaveBeenCalledWith(expect.objectContaining({ label: "12", progress: 0.4 }));
    expect(element.style.setProperty).toHaveBeenCalledWith("--timer-progress", "0.4000");
    expect(playAll).not.toHaveBeenCalled();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageVisualControllers?: unknown };
    expect(host.PartyGameStageVisualControllers).toBeTypeOf("object");
  });
});
