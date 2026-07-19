import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { IDS, migrateCraftingTimerWidget } = require("./migrate-crafting-timer-widget");

describe("Crafting Timer widget manifest migration", () => {
  it("uses one lifecycle parent and one three-element visual child", () => {
    const manifest = migrateCraftingTimerWidget({ compositions: {} }, "2026-07-15T00:00:00.000Z");
    const base = manifest.compositions[IDS.base];
    const widget = manifest.compositions[IDS.widget];

    expect(base.timeline.labels).toEqual([{ name: "Default", frame: 0 }]);
    expect(base.components.map((component) => component.id)).toEqual([
      "timer-value", "timer-background", "timer-fill"
    ]);
    expect(base.components.every((component) => component.defaultAnimationState === "Default")).toBe(true);

    expect(widget.components).toEqual([expect.objectContaining({
      id: IDS.baseReference,
      instanceLabel: "craftingTimer",
      artCompositionId: IDS.base,
      referenceSizeMode: "intrinsic",
      defaultAnimationState: "Default"
    })]);
    expect(widget.timeline.tracks).toEqual([expect.objectContaining({ targetId: IDS.baseReference })]);
    expect(widget.timeline.commands.every((command) => !["playComponent", "stopComponent"].includes(command.type))).toBe(true);
    expect(manifest.compositions[IDS.legacyAnimated]).toBeUndefined();
  });

  it("preserves edited visual art and authored lifecycle poses while removing the middle wrapper", () => {
    const source = {
      compositions: {
        [IDS.base]: {
          components: [
            { id: "timer-value", kind: "text", defaultText: "45", fontColor: "#123456" },
            { id: "timer-ring", kind: "shape", fillColor: "#abcdef" }
          ]
        },
        [IDS.legacyAnimated]: {
          timeline: {
            fps: 30,
            frameCount: 33,
            labels: [{ name: "Off", frame: 0 }, { name: "Appear", frame: 2 }],
            commands: [{ id: "stop-0", frame: 0, type: "stop" }],
            tracks: [{
              id: "legacy-track",
              targetId: "legacy-child",
              keyframes: [{ id: "authored", frame: 2, props: { scale: 0.61, width: 180, height: 180 } }]
            }]
          }
        },
        unrelated: { name: "Keep Me" }
      },
      organization: {
        stage: {
          folders: [{ id: "global", name: "Global Assets" }],
          folderItems: { global: ["composition:unrelated", `composition:${IDS.legacyAnimated}`] }
        }
      }
    };
    const manifest = migrateCraftingTimerWidget(source, "2026-07-15T00:00:00.000Z");

    expect(manifest.compositions[IDS.base].components).toContainEqual(expect.objectContaining({
      id: "timer-value", defaultText: "45", fontColor: "#123456"
    }));
    expect(manifest.compositions[IDS.base].components).toContainEqual(expect.objectContaining({
      id: "timer-fill", fillColor: "#abcdef"
    }));
    expect(manifest.compositions[IDS.widget].timeline.tracks[0]).toEqual(expect.objectContaining({
      targetId: IDS.baseReference,
      keyframes: [expect.objectContaining({ props: { scale: 0.61 } })]
    }));
    expect(manifest.compositions.unrelated).toEqual({ name: "Keep Me" });
    expect(manifest.organization.stage.folderItems.global).toEqual([
      "composition:unrelated", `composition:${IDS.base}`, `composition:${IDS.widget}`
    ]);
    expect(manifest.deletedCompositionIds).toContain(IDS.legacyAnimated);
  });
});
