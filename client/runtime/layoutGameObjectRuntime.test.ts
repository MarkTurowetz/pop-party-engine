import { describe, expect, it } from "vitest";
import { PartyGameLayoutGameObjects } from "./layoutGameObjectRuntime";

describe("PartyGameLayoutGameObjects (ported layout-game-object-runtime)", () => {
  it("exposes the layout game-object helpers", () => {
    expect(PartyGameLayoutGameObjects.activeDynamicLayoutArtInstanceIds).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.setLayoutGameObjectShownForAction).toBeTypeOf("function");
  });

  it("activeDynamicLayoutArtInstanceIds collects dynamic state + non-hidden global ids", () => {
    const isDynamic = (el: { dynamic?: boolean }) => el.dynamic === true;
    const ids = PartyGameLayoutGameObjects.activeDynamicLayoutArtInstanceIds(
      { elements: [{ id: "a", dynamic: true }, { id: "b" }], hiddenGlobals: ["g2"] },
      { elements: [{ id: "g1", dynamic: true }, { id: "g2", dynamic: true }], hiddenInStates: false },
      isDynamic as never
    );
    expect([...ids].sort()).toEqual(["a", "g1"]);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameLayoutGameObjects?: unknown };
    expect(host.PartyGameLayoutGameObjects).toBeTypeOf("object");
  });
});
