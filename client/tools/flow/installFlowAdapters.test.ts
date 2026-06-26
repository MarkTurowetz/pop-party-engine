import { describe, expect, it, vi } from "vitest";
import { installFlowAdapters } from "./installFlowAdapters";

describe("Flow adapter installer", () => {
  it("installs all browser adapters in one call", () => {
    const setAttribute = vi.fn();
    const target = { document: { documentElement: { setAttribute } } } as unknown as Window;

    const adapters = installFlowAdapters(target);

    expect(target.PartyGameFlowActionDefaults).toBe(adapters.actionDefaults);
    expect(target.PartyGameFlowActionOptions).toBe(adapters.actionOptions);
    expect(target.PartyGameFlowActionSummary).toBe(adapters.actionSummary);
    expect(target.PartyGameFlowActions).toBe(adapters.actions);
    expect(target.PartyGameFlowDecision).toBe(adapters.decision);
    expect(target.PartyGameFlowMutations).toBe(adapters.mutations);
    expect(target.PartyGameFlowRouteGraph).toBe(adapters.routeGraph);
    expect(target.PartyGameFlowSelection).toBe(adapters.selection);
    expect(target.PartyGameFlowSerialization).toBe(adapters.serialization);
    expect(target.PartyGameFlowSelectors).toBe(adapters.selectors);
    expect(setAttribute).toHaveBeenCalledWith("data-flow-adapters", "module");
  });
});
