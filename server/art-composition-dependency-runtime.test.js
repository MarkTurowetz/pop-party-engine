import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  compositionRevision,
  createArtCompositionDependencyReport
} = require("./art-composition-dependency-runtime");

describe("art composition dependency runtime", () => {
  it("reports every supported composition dependency source", () => {
    const target = { id: "target", name: "Target", components: [] };
    const source = {
      id: "source",
      name: "Source",
      components: [{
        id: "group",
        name: "Group",
        children: [{ id: "reference", kind: "reference", artCompositionId: "target", instanceLabel: "Nested target" }]
      }]
    };
    const report = createArtCompositionDependencyReport({
      compositions: [target, source],
      stageLayouts: {
        global: { id: "stage-global", elements: [{ id: "stage-target", artCompositionId: "target" }] },
        states: []
      },
      controllerLayouts: {
        states: [{ id: "controller-state", elements: [{ id: "controller-target", artCompositionId: "target" }] }]
      },
      flow: { actions: [{ config: { selectedCompositionId: "target" } }] },
      runtimeReferences: [{ compositionId: "target", sourceId: "runtime-source" }]
    });

    expect(report.dependencies.target).toEqual({
      compositionId: "target",
      total: 5,
      artReferences: 1,
      stageLayoutReferences: 1,
      controllerLayoutReferences: 1,
      flowReferences: 1,
      runtimeReferences: 1,
      details: [
        { kind: "art", sourceCompositionId: "source", sourceName: "Source", sourcePath: "Group / Nested target" },
        { kind: "stageLayout", sourceId: "stage-global", sourceName: "stage-global", sourcePath: "stage-target" },
        { kind: "controllerLayout", sourceId: "controller-state", sourceName: "controller-state", sourcePath: "controller-target" },
        { kind: "flow", sourcePath: "actions / 0 / config / selectedCompositionId" },
        { kind: "runtime", sourceId: "runtime-source", sourceName: "runtime-source", sourcePath: "" }
      ]
    });
    expect(report.compositionRevisions.target).toBe(compositionRevision(target));
    expect(compositionRevision(target)).not.toBe(compositionRevision({ ...target, name: "Changed" }));
  });
});
