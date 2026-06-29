import { describe, expect, it } from "vitest";
import { PartyGameStageTextRenderer } from "./stageTextRenderer";

describe("PartyGameStageTextRenderer (ported stage-text-renderer)", () => {
  it("returns null when there is no target", () => {
    expect(PartyGameStageTextRenderer.renderStageTextBox(null, "Hi")).toBe(null);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageTextRenderer?: { renderStageTextBox?: unknown } };
    expect(host.PartyGameStageTextRenderer?.renderStageTextBox).toBeTypeOf("function");
  });
});
