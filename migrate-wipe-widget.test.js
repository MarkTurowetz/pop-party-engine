import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { COLORS, IDS, migrateWipeWidget } = require("./migrate-wipe-widget");

describe("Wipe widget manifest migration", () => {
  it("builds a two-state widget gate around independently animated wipe art", () => {
    const manifest = migrateWipeWidget({ compositions: {} }, "2026-07-15T00:00:00.000Z");
    const art = manifest.compositions[IDS.art];
    const widget = manifest.compositions[IDS.widget];

    expect(art.components.map((component) => component.fillColor)).toEqual(COLORS);
    expect(art.timeline.labels.map((label) => label.name)).toEqual([
      "Off",
      "Park",
      "On",
      "Appear",
      "Update",
      "Disappear"
    ]);
    expect(art.timeline.commands).toContainEqual(expect.objectContaining({ frame: 22, type: "stop" }));
    expect(art.timeline.commands).toContainEqual(expect.objectContaining({ frame: 45, type: "setVisible", target: "false" }));
    expect(art.timeline.tracks).toHaveLength(COLORS.length);

    expect(widget.components).toContainEqual(
      expect.objectContaining({ instanceLabel: "wipeArtMC", artCompositionId: IDS.art, defaultAnimationState: "Off" })
    );
    expect(widget.timeline.frameCount).toBe(2);
    expect(widget.timeline.labels).toEqual([
      { name: "Off", frame: 0 },
      { name: "On", frame: 1 }
    ]);
    expect(widget.timeline.commands).toEqual([
      { id: "stop-0", frame: 0, type: "stop" },
      { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
      { id: "stop-1", frame: 1, type: "stop" },
      { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" }
    ]);
    expect(widget.timeline.tracks).toEqual([]);
  });

  it("preserves unrelated manifest data and registers the widget with Global Assets", () => {
    const source = {
      compositions: { existing: { name: "Existing" } },
      organization: {
        stage: {
          folders: [{ id: "global", name: "Global Assets" }],
          order: [],
          folderItems: { global: ["composition:existing"] }
        }
      }
    };
    const manifest = migrateWipeWidget(source, "2026-07-15T00:00:00.000Z");

    expect(manifest.compositions.existing).toEqual(source.compositions.existing);
    expect(manifest.organization.stage.folderItems.global).toEqual([
      "composition:existing",
      `composition:${IDS.art}`,
      `composition:${IDS.widget}`
    ]);
  });
});
