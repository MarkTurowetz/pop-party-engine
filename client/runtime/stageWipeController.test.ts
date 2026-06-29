import { describe, expect, it } from "vitest";
import { PartyGameStageWipe } from "./stageWipeController";

describe("PartyGameStageWipe (ported wipe-controller)", () => {
  it("createController returns a controller with the wipe surface", () => {
    const controller = PartyGameStageWipe.createController({});
    expect(controller.transition).toBeTypeOf("function");
    expect(controller.cancel).toBeTypeOf("function");
    expect(controller.setShown).toBeTypeOf("function");
  });

  it("setShown returns 0 without an element/visual", () => {
    const controller = PartyGameStageWipe.createController({});
    expect(controller.setShown(true)).toBe(0);
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
