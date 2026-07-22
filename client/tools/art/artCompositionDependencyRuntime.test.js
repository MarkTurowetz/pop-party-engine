import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtCompositionDependencyReport } = require("../../../server/art-composition-dependency-runtime");
const { artRuntimeReferences } = require("../../../server/art-runtime-dependencies");

describe("art composition dependency report", () => {
  it("reports nested art, layout, flow, and runtime references", () => {
    const child = { id: "child", name: "Child", components: [] };
    const parent = {
      id: "parent",
      name: "Parent",
      components: [{
        id: "group",
        kind: "container",
        children: [{ id: "slot", name: "Slot", kind: "reference", artCompositionId: "child" }]
      }]
    };
    const report = createArtCompositionDependencyReport({
      compositions: [parent, child],
      stageLayouts: { global: { id: "global", elements: [{ id: "placed", artCompositionId: "parent" }] }, states: [] },
      controllerLayouts: { global: { id: "controller", elements: [{ id: "button", artCompositionId: "child" }] }, states: [] },
      flow: { states: [{ id: "state", artCompositionId: "child" }] },
      runtimeReferences: [{ compositionId: "parent", sourceId: "runtime-root" }]
    });

    expect(report.dependencies.child).toMatchObject({ total: 3, artReferences: 1, controllerLayoutReferences: 1, flowReferences: 1 });
    expect(report.dependencies.parent).toMatchObject({ total: 2, stageLayoutReferences: 1, runtimeReferences: 1 });
    expect(report.dependencies.child.details[0]).toMatchObject({ kind: "art", sourceCompositionId: "parent" });
    expect(report.compositionRevisions.child).toMatch(/^[a-f0-9]{64}$/);
  });

  it("tracks the authored player prefabs without retaining legacy player compositions", () => {
    const runtimeIds = artRuntimeReferences({
      "engine.stage.playerIdentityWidget": { compositionId: "prefab-player-widget-mc" },
      "engine.shared.playerAvatar": { compositionId: "prefab-player-avatar-mc" },
      "engine.stage.transition": { compositionId: "wipe-widget-mc" }
    }).map((reference) => reference.compositionId);
    expect(runtimeIds).toContain("prefab-player-widget-mc");
    expect(runtimeIds).toContain("prefab-player-avatar-mc");
    expect(runtimeIds).toContain("wipe-widget-mc");
    for (const species of ["rex", "stego", "trike", "raptor", "bronto", "ankylo"]) {
      expect(runtimeIds).not.toContain(`player-avatar-${species}`);
      expect(runtimeIds).not.toContain(`player-object-${species}`);
    }
  });
});
