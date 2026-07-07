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

  it("routes parent timeline snapshots to descendant component views", () => {
    const snapshots: unknown[] = [];
    const parent = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      applyTimelineSnapshotToDescendants: (snapshot: unknown) => void;
    };
    const child = Object.create(PartyGameArtObject.ArtObjectView.prototype) as {
      component: { id: string };
      children: Map<string, unknown>;
      createVisual: () => { applyTimelineSnapshot: (snapshot: unknown) => void };
    };
    parent.component = { id: "parent" };
    child.component = { id: "child" };
    child.children = new Map();
    child.createVisual = () => ({ applyTimelineSnapshot: (snapshot) => snapshots.push(snapshot) });
    parent.children = new Map([["child", child]]);

    const snapshot = { frame: 2, targets: { parent: { opacity: 0.5 }, child: { x: 24 } } };
    parent.applyTimelineSnapshotToDescendants(snapshot);

    expect(snapshots).toEqual([snapshot]);
  });
});
