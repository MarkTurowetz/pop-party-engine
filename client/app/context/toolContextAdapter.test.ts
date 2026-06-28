import { describe, expect, it, vi } from "vitest";
import { createToolAppContext } from "./createToolAppContext";
import { installToolContextAdapter } from "./toolContextAdapter";

describe("tool context adapter", () => {
  it("installs the tool app context for legacy Vite routes", () => {
    const setAttribute = vi.fn();
    const target = {
      document: {
        documentElement: { setAttribute }
      }
    } as unknown as Window;
    const context = createToolAppContext({ surface: "flow" });

    const adapter = installToolContextAdapter(context, target);

    expect(target.PartyGameToolContext).toBe(adapter);
    expect(adapter.surface).toBe("flow");
    expect(adapter.api).toBe(context.api);
    expect(setAttribute).toHaveBeenCalledWith("data-tool-context-adapter", "flow");
  });
});
