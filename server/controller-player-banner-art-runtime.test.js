import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { controllerPlayerBannerOverride } = require("./controller-player-banner-art-runtime");

const current = {
  id: "controller-player-banner",
  name: "Controller Player Banner",
  surface: "controller",
  compositionKind: "gameObject",
  timelineArchitectureVersion: 2,
  canvas: { width: 338, height: 78 },
  components: [
    { id: "player-avatar-mc", artCompositionId: "prefab-player-avatar-mc" },
    { id: "player-name-mc", artCompositionId: "prefab-player-name-mc" }
  ],
  timeline: { frameCount: 2 }
};

describe("controller Player Banner art migration", () => {
  it("replaces the stale flat banner with the compound child hierarchy", () => {
    const migrated = controllerPlayerBannerOverride(current, {
      "controller-player-banner": {
        components: [{ id: "banner-name" }, { id: "banner-card" }],
        timeline: { frameCount: 33 }
      }
    });

    expect(migrated.components).toEqual(current.components);
    expect(migrated.timeline).toEqual({ frameCount: 2 });
  });

  it("preserves later authored edits once the compound hierarchy is current", () => {
    const saved = {
      components: [
        { id: "player-avatar-mc", artCompositionId: "prefab-player-avatar-mc", x: 50 },
        { id: "player-name-mc", artCompositionId: "prefab-player-name-mc", x: 210 }
      ]
    };

    expect(controllerPlayerBannerOverride(current, { "controller-player-banner": saved })).toBe(saved);
  });
});
