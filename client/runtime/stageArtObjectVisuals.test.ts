import { describe, expect, it } from "vitest";
import { PartyGameArtObject } from "./stageArtObjectVisuals";

describe("PartyGameArtObject (ported art-object-visuals)", () => {
  it("exposes the renderer + view classes and helpers", () => {
    expect(PartyGameArtObject.ArtObjectTreeRenderer).toBeTypeOf("function");
    expect(PartyGameArtObject.ArtObjectView).toBeTypeOf("function");
    expect(PartyGameArtObject.applyComponentLayout).toBeTypeOf("function");
    expect(PartyGameArtObject.renderComponentText).toBeTypeOf("function");
    expect(PartyGameArtObject.syncComponentElement).toBeTypeOf("function");
  });

  it("renderComponentText returns null without a target", () => {
    expect(PartyGameArtObject.renderComponentText(null, { id: "x" })).toBe(null);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameArtObject?: unknown };
    expect(host.PartyGameArtObject).toBeTypeOf("object");
  });
});
