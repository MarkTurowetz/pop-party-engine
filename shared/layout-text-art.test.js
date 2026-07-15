import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  defaultLayoutTextFieldCompositions,
  layoutTextArtCompositionId,
  layoutTextArtTextPrefabId,
  migrateLayoutTextFieldWidgetComponents,
  migrateLayoutTextFieldWidgetKind,
  migrateLayoutTextFieldWidgetTimeline
} = require("./layout-text-art");

describe("layout text field widget definitions", () => {
  it("defines a lifecycle game object containing a reusable text prefab", () => {
    const compositions = defaultLayoutTextFieldCompositions();
    const gameObject = compositions.find((composition) => composition.id === layoutTextArtCompositionId);
    const prefab = compositions.find((composition) => composition.id === layoutTextArtTextPrefabId);

    expect(gameObject).toMatchObject({
      compositionKind: "prefab",
      timelineArchitectureVersion: 2,
      components: [expect.objectContaining({
        instanceLabel: "layoutTextFieldText",
        kind: "reference",
        artCompositionId: layoutTextArtTextPrefabId
      })]
    });
    expect(gameObject.timeline.labels.map((label) => label.name)).toEqual([
      "Off", "Park", "On", "Appear", "Update", "Disappear"
    ]);
    expect(prefab).toMatchObject({
      name: "Layout Text Field Text",
      compositionKind: "prefab",
      components: [expect.objectContaining({ instanceLabel: "text", kind: "text" })]
    });
  });

  it("migrates the layout-facing composition to a prefab", () => {
    expect(migrateLayoutTextFieldWidgetKind(layoutTextArtCompositionId, "gameObject")).toBe("prefab");
    expect(migrateLayoutTextFieldWidgetKind("another-object", "gameObject")).toBe("gameObject");
  });

  it("migrates the legacy direct text layer to the nested prefab reference", () => {
    const components = [
      { id: "text", kind: "text", defaultText: "LEGACY" },
      { id: "decoration", kind: "shape" }
    ];

    migrateLayoutTextFieldWidgetComponents(layoutTextArtCompositionId, components);

    expect(components).not.toContainEqual(expect.objectContaining({ id: "text", kind: "text" }));
    expect(components).toContainEqual(expect.objectContaining({
      instanceLabel: "layoutTextFieldText",
      kind: "reference",
      artCompositionId: layoutTextArtTextPrefabId
    }));
    expect(components).toContainEqual(expect.objectContaining({ id: "decoration" }));
  });

  it("replaces a stale legacy timeline with the authored prefab-reference lifecycle", () => {
    const gameObject = defaultLayoutTextFieldCompositions()
      .find((composition) => composition.id === layoutTextArtCompositionId);
    const staleTimeline = { fps: 30, frameCount: 33, labels: [], commands: [], tracks: [] };

    const migrated = migrateLayoutTextFieldWidgetTimeline(
      layoutTextArtCompositionId,
      staleTimeline,
      gameObject.timeline
    );

    expect(migrated.tracks).toContainEqual(expect.objectContaining({
      targetId: "layout-text-field-text"
    }));
  });
});
