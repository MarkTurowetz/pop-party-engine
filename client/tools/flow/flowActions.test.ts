import { describe, expect, it, vi } from "vitest";
import { createDefaultFlowAction } from "./flowActions";
import { installFlowActionsAdapter } from "./flowActionsAdapter";

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

  it("installs a legacy compatibility adapter with a DOM-visible marker", () => {
    const setAttribute = vi.fn();
    const target = {
      document: {
        documentElement: { setAttribute }
      }
    } as unknown as Window;

    const adapter = installFlowActionsAdapter(target);

    expect(target.PartyGameFlowActions).toBe(adapter);
    expect(adapter.createDefaultFlowAction("state", "Action", false, { timestamp: 1 }).id).toBe("state-action-1");
    expect(setAttribute).toHaveBeenCalledWith("data-flow-actions-adapter", "module");
  });
});
