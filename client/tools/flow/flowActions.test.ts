import { describe, expect, it } from "vitest";
import { createDefaultFlowAction, ensureActionTiming } from "./flowActions";

describe("Flow actions", () => {
  it("creates a default top-level action matching the legacy shape", () => {
    expect(createDefaultFlowAction("intro", "Action 1", false, { timestamp: 123456789 })).toEqual({
      id: "intro-action-21i3v9",
      name: "Action 1",
      type: "presentText",
      timing: { mode: "E+", seconds: 0 },
      text: "Presented text",
      textTarget: "",
      instant: false,
      isShown: true,
      subActions: []
    });
  });

  it("creates a default sub-action matching the legacy shape", () => {
    expect(createDefaultFlowAction("intro", "Sub-Action 1", true, { timestamp: 123456789 })).toMatchObject({
      id: "intro-sub-action-21i3v9",
      name: "Sub-Action 1",
      type: "setPlayersShown",
      timing: { mode: "S+", seconds: 0 },
      subActions: []
    });
  });

  it("normalizes action timing with legacy input and sub-action rules", () => {
    const standardAction = { id: "standard", type: "presentText", timing: { mode: "S+", seconds: "2" } };
    const inputAction = { id: "input", type: "textInput", timing: { mode: "S+", seconds: -5 } };
    const subAction = { id: "sub", type: "presentText", timing: { mode: "E+", seconds: "bad" } };
    const actionTypeMeta = (type: string) => ({ category: type === "textInput" ? "input" : "standard" });

    expect(ensureActionTiming(standardAction, false, { actionTypeMeta })).toEqual({ mode: "S+", seconds: 2 });
    expect(ensureActionTiming(inputAction, false, { actionTypeMeta })).toEqual({ mode: "E+", seconds: 0 });
    expect(ensureActionTiming(subAction, true, { actionTypeMeta })).toEqual({ mode: "S+", seconds: 0 });
  });
});
