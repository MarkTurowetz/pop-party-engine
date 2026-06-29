import { describe, expect, it } from "vitest";
import { PartyGameStageWidgetArt } from "./stageWidgetArtRenderer";

describe("PartyGameStageWidgetArt (ported widget-art-renderer)", () => {
  it("createRenderer returns the render surface", () => {
    const renderer = PartyGameStageWidgetArt.createRenderer({});
    expect(renderer.render).toBeTypeOf("function");
    expect(renderer.renderBound).toBeTypeOf("function");
    expect(renderer.positionOverlay).toBeTypeOf("function");
  });

  it("render returns null without a host", () => {
    const renderer = PartyGameStageWidgetArt.createRenderer({ getComposition: () => ({ components: [] }) });
    expect(renderer.render(null, "any")).toBe(null);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageWidgetArt?: unknown };
    expect(host.PartyGameStageWidgetArt).toBeTypeOf("object");
  });
});
