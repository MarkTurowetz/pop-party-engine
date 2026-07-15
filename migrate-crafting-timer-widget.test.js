import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { IDS, migrateCraftingTimerWidget } = require("./migrate-crafting-timer-widget");

describe("Crafting Timer widget manifest migration", () => {
  it("splits visual, animated, and parent callback responsibilities", () => {
    const manifest = migrateCraftingTimerWidget({ compositions: {} }, "2026-07-15T00:00:00.000Z");
    const base = manifest.compositions[IDS.base];
    const animated = manifest.compositions[IDS.animated];
    const widget = manifest.compositions[IDS.widget];

    expect(base.timeline.labels).toEqual([{ name: "Default", frame: 0 }]);
    expect(base.timeline.commands).toEqual([{ id: "stop-0", frame: 0, type: "stop" }]);
    expect(base.components.map((component) => component.id)).toEqual(["timer-value", "timer-ring"]);
    expect(base.components.every((component) => component.defaultAnimationState === "Default")).toBe(true);

    expect(animated.components).toContainEqual(expect.objectContaining({
      instanceLabel: "craftingTimer",
      artCompositionId: IDS.base,
      defaultAnimationState: "Default"
    }));
    expect(animated.timeline.tracks[0].targetId).toBe(IDS.baseReference);

    expect(widget.components).toContainEqual(expect.objectContaining({
      instanceLabel: "craftingTimerMC",
      artCompositionId: IDS.animated,
      defaultAnimationState: "Off"
    }));
    expect(widget.timeline.commands).toContainEqual(expect.objectContaining({
      frame: 2,
      type: "playComponent",
      target: IDS.animatedReference,
      event: "Appear"
    }));
    expect(widget.timeline.commands).toContainEqual(expect.objectContaining({
      frame: 17,
      type: "playComponent",
      target: IDS.animatedReference,
      event: "Disappear"
    }));
  });

  it("preserves edited timer art while replacing the legacy monolithic lifecycle", () => {
    const source = {
      compositions: {
        [IDS.widget]: {
          components: [
            { id: "timer-value", kind: "text", defaultText: "45", fontColor: "#123456" },
            { id: "timer-ring", kind: "shape", fillColor: "#abcdef" }
          ]
        },
        unrelated: { name: "Keep Me" }
      },
      organization: {
        stage: {
          folders: [{ id: "global", name: "Global Assets" }],
          folderItems: { global: ["composition:unrelated"] }
        }
      }
    };
    const manifest = migrateCraftingTimerWidget(source, "2026-07-15T00:00:00.000Z");

    expect(manifest.compositions[IDS.base].components).toContainEqual(expect.objectContaining({
      id: "timer-value",
      defaultText: "45",
      fontColor: "#123456"
    }));
    expect(manifest.compositions[IDS.base].components).toContainEqual(expect.objectContaining({
      id: "timer-ring",
      fillColor: "#abcdef"
    }));
    expect(manifest.compositions.unrelated).toEqual({ name: "Keep Me" });
    expect(manifest.organization.stage.folderItems.global).toEqual([
      "composition:unrelated",
      `composition:${IDS.base}`,
      `composition:${IDS.animated}`,
      `composition:${IDS.widget}`
    ]);
  });
});
