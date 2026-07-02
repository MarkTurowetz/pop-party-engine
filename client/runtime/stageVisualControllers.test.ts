import { describe, expect, it } from "vitest";
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

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageVisualControllers?: unknown };
    expect(host.PartyGameStageVisualControllers).toBeTypeOf("object");
  });
});
