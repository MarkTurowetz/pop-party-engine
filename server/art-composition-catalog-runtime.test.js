import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtCompositionCatalogRuntime } = require("./art-composition-catalog-runtime");

describe("Art composition catalog", () => {
  it("merges base, manifest, and draft compositions with deletion and draft precedence", () => {
    const drafts = [
      { id: "base-one", source: "draft" },
      { id: "base-two", source: "deleted-draft" }
    ];
    const runtime = createArtCompositionCatalogRuntime({
      baseCompositions: [
        { id: "base-one", source: "base" },
        { id: "base-two", source: "base" }
      ],
      createCustomDefinition: (id, record) => ({ id, source: "custom", name: record.name }),
      normalizeComposition: (composition) => ({ ...composition, normalized: true }),
      readDraftCompositions: () => drafts
    });

    expect(runtime.allPublicArtCompositions({
      compositions: {
        "base-one": { name: "Override for a base composition" },
        "custom-card": { name: "Custom Card" }
      },
      deletedCompositionIds: ["base-two"]
    })).toEqual([
      { id: "base-one", source: "draft" },
      { id: "custom-card", source: "custom", name: "Custom Card", normalized: true }
    ]);
    expect(runtime.hasBaseComposition("BASE-ONE")).toBe(true);
    expect(runtime.hasBaseComposition("custom-card")).toBe(false);
  });

  it("serializes the portable authored fields with a deterministic injected timestamp", () => {
    const runtime = createArtCompositionCatalogRuntime({ now: () => "2026-07-22T12:00:00.000Z" });

    expect(runtime.artCompositionManifestRecord({
      id: "answer",
      name: "Answer",
      description: "Answer art",
      surface: "stage",
      compositionKind: "prefab",
      isCustom: true,
      timelineArchitectureVersion: 2,
      canvas: { width: 100, height: 50 },
      components: [],
      timeline: { fps: 30 }
    })).toEqual({
      name: "Answer",
      description: "Answer art",
      surface: "stage",
      compositionKind: "prefab",
      isCustom: true,
      timelineArchitectureVersion: 2,
      canvas: { width: 100, height: 50 },
      components: [],
      timeline: { fps: 30 },
      updatedAt: "2026-07-22T12:00:00.000Z"
    });
  });
});
