import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  installDefaultLobbyWidgetCompositions,
  legacyLobbyWidgetChildOverride,
  lobbyWidgetConfigs,
  migrateLobbyWidgetComponents,
  migrateLobbyWidgetKind,
  migrateLobbyWidgetName,
  migrateLobbyWidgetReferenceBounds,
  migrateLobbyWidgetTimeline
} = require("./lobby-widget-art");

function legacyParent(config) {
  return {
    id: config.parentId,
    name: config.parentName,
    canvas: { width: 200, height: 100 },
    components: [{ id: Object.keys(config.componentLabels)[0], kind: "text", defaultText: "Saved art" }]
  };
}

describe("Lobby widget prefab conversion", () => {
  it("converts every layout-facing widget to a lifecycle prefab with a base art prefab", () => {
    const source = lobbyWidgetConfigs.map(legacyParent);
    installDefaultLobbyWidgetCompositions(source);

    for (const config of lobbyWidgetConfigs) {
      const parent = source.find((composition) => composition.id === config.parentId);
      const child = source.find((composition) => composition.id === config.childId);
      expect(parent).toMatchObject({
        name: config.parentName,
        compositionKind: "prefab",
        components: [expect.objectContaining({
          id: config.referenceId,
          instanceLabel: config.instanceLabel,
          kind: "reference",
          artCompositionId: config.childId
        })]
      });
      expect(parent.timeline.tracks).toContainEqual(expect.objectContaining({ targetId: config.referenceId }));
      expect(child).toMatchObject({ name: config.childName, compositionKind: "prefab" });
      expect(child.timeline.labels.map((label) => label.name)).toEqual(["Default", "Park"]);
    }
  });

  it("preserves saved legacy visual layers as a derived child override", () => {
    const config = lobbyWidgetConfigs[0];
    const parent = legacyParent(config);
    const override = legacyLobbyWidgetChildOverride(config.childId, { [config.parentId]: parent });

    expect(override).toMatchObject({
      compositionKind: "prefab",
      canvas: { width: 200, height: 100 },
      components: [expect.objectContaining({ defaultText: "Saved art" })]
    });
  });

  it("migrates stale parent kind, components, bounds, and lifecycle timeline", () => {
    const config = lobbyWidgetConfigs[1];
    const components = [{ id: "legacy", kind: "shape" }];
    migrateLobbyWidgetComponents(config.parentId, components);
    migrateLobbyWidgetReferenceBounds(config.parentId, components, { width: 560, height: 190 });
    const fallbackTimeline = installDefaultLobbyWidgetCompositions([legacyParent(config)])[0].timeline;

    expect(migrateLobbyWidgetKind(config.parentId, "gameObject")).toBe("prefab");
    expect(components).toEqual([expect.objectContaining({
      x: 280,
      y: 95,
      width: 560,
      height: 190,
      artCompositionId: config.childId
    })]);
    expect(migrateLobbyWidgetTimeline(config.parentId, { tracks: [] }, fallbackTimeline).tracks)
      .toContainEqual(expect.objectContaining({ targetId: config.referenceId }));
  });

  it("migrates the legacy Join Widget display name to Join Prompt", () => {
    expect(migrateLobbyWidgetName("join-widget", "Join Widget")).toBe("Join Prompt");
    expect(migrateLobbyWidgetName("stage-code-panel", "Custom Stage Code")).toBe("Custom Stage Code");
  });
});
