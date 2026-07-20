import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  hasPointPopupContainer,
  migratePlayerWidgetPointPopupAnchorComponents,
  playerWidgetPointPopupAnchorOverride
} = require("./player-widget-point-popup-anchor-runtime");

describe("player widget point popup anchor migration", () => {
  it("injects the anchor during ordinary composition normalization", () => {
    const components = [{ id: "player-avatar-mc", x: 150, y: 234 }];

    expect(migratePlayerWidgetPointPopupAnchorComponents("prefab-player-widget-mc", components)).toBe(components);
    expect(components.map((component) => component.id)).toEqual([
      "player-avatar-mc",
      "point-popup-container"
    ]);
  });

  it("adds the authored popup anchor without changing existing player widget children", () => {
    const saved = {
      id: "prefab-player-widget-mc",
      canvas: { width: 300, height: 370 },
      components: [{ id: "player-avatar-mc", x: 123, y: 234 }]
    };

    const migrated = playerWidgetPointPopupAnchorOverride(
      { id: "prefab-player-widget-mc" },
      { "prefab-player-widget-mc": saved }
    );

    expect(migrated).not.toBe(saved);
    expect(migrated.components[0]).toEqual(saved.components[0]);
    expect(migrated.components[1]).toEqual(expect.objectContaining({
      id: "point-popup-container",
      instanceLabel: "pointPopupContainer",
      kind: "container",
      x: 150,
      y: 180
    }));
    expect(hasPointPopupContainer(migrated)).toBe(true);
  });

  it("preserves an existing authored popup anchor", () => {
    const saved = {
      id: "prefab-player-widget-mc",
      components: [{ id: "point-popup-container", x: 91, y: 72 }]
    };

    expect(playerWidgetPointPopupAnchorOverride(
      { id: "prefab-player-widget-mc" },
      { "prefab-player-widget-mc": saved }
    )).toBe(saved);
  });
});
