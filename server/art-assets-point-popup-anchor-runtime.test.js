import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtAssetsRuntime } = require("./art-assets-runtime");

function createRuntime() {
  return createArtAssetsRuntime({
    acceptedArtTypes: [],
    artCompositions: [],
    artAssets: [],
    artGroups: [],
    artRoot: "/tmp/party-game-point-popup-anchor-test",
    contentTypeForFile: () => "application/octet-stream",
    customDir: "/tmp/party-game-point-popup-anchor-test/custom",
    defaultDir: "/tmp/party-game-point-popup-anchor-test/default",
    manifestFile: "/tmp/party-game-point-popup-anchor-test/manifest.json",
    readJson: () => ({}),
    sendJson: () => {}
  });
}

describe("Art Manager Player Widget MC normalization", () => {
  it("keeps the popup anchor in local Art Manager drafts", () => {
    const [composition] = createRuntime().normalizeArtCompositionsDraft([{
      id: "prefab-player-widget-mc",
      name: "Player Widget MC",
      surface: "stage",
      compositionKind: "prefab",
      canvas: { width: 300, height: 370 },
      components: [
        { id: "player-answer-bubble-mc", name: "Player Answer Bubble MC", kind: "reference", x: 150, y: 96, width: 220, height: 130 },
        { id: "player-avatar-mc", name: "Player Avatar MC", kind: "reference", x: 150, y: 234, width: 100, height: 100 },
        { id: "player-name-mc", name: "Player Name MC", kind: "reference", x: 150, y: 309, width: 122, height: 38 },
        { id: "vip-mc", name: "VIP MC", kind: "reference", x: 150, y: 345, width: 44, height: 22 }
      ]
    }]);

    expect(composition.components.map((component) => component.id)).toEqual([
      "player-answer-bubble-mc",
      "player-avatar-mc",
      "player-name-mc",
      "vip-mc",
      "point-popup-container"
    ]);
    expect(composition.components.at(-1)).toEqual(expect.objectContaining({
      name: "Point Popup Container",
      instanceLabel: "pointPopupContainer",
      x: 150,
      y: 180,
      width: 154,
      height: 64
    }));
  });

  it("upgrades Player Point Popup with the authored top-level Popup animation", () => {
    const [composition] = createRuntime().normalizeArtCompositionsDraft([{
      id: "player-point-popup",
      name: "Player Point Popup",
      surface: "stage",
      compositionKind: "gameObject",
      canvas: { width: 154, height: 64 },
      components: [
        { id: "point-text", name: "Point Text", kind: "text", x: 75, y: 30, width: 150, height: 60 },
        { id: "point-shadow", name: "Point Shadow", kind: "text", x: 79, y: 34, width: 150, height: 60 }
      ],
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [{ name: "Appear", frame: 1 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: []
      }
    }]);

    expect(composition.timeline.labels).toContainEqual({ name: "Popup", frame: 33 });
    expect(composition.timeline.commands).toContainEqual({ frame: 78, type: "setVisible", target: "false" });
    expect(composition.timeline.commands).toContainEqual({ frame: 78, type: "stop" });
  });
});
