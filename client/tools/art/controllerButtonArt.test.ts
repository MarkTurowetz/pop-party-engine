import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtAssetsRuntime } = require("../../../server/art-assets-runtime");
const { defaultArtCompositions } = require("../../../shared/game-data");

function createRuntime() {
  return createArtAssetsRuntime({
    acceptedArtTypes: [],
    artCompositions: defaultArtCompositions,
    artAssets: [],
    artGroups: [],
    artRoot: "/tmp/party-game-controller-button-art-test",
    contentTypeForFile: () => "application/octet-stream",
    customDir: "/tmp/party-game-controller-button-art-test/custom",
    defaultDir: "/tmp/party-game-controller-button-art-test/default",
    manifestFile: "/tmp/party-game-controller-button-art-test/manifest.json",
    readJson: () => ({}),
    sendJson: () => {}
  });
}

describe("controller button art hierarchy", () => {
  it.each(["controller-primary-button", "controller-choice-option", "controller-avatar-button"])(
    "layers lifecycle, interaction, visual state, and base art for %s",
    (parentId) => {
      const parent = defaultArtCompositions.find((composition: { id: string }) => composition.id === parentId);
      const interaction = defaultArtCompositions.find((composition: { id: string }) => composition.id === `${parentId}-interaction`);
      const state = defaultArtCompositions.find((composition: { id: string }) => composition.id === `${parentId}-state`);
      const art = defaultArtCompositions.find((composition: { id: string }) => composition.id === `${parentId}-art`);

      expect(parent.components[0].artCompositionId).toBe(interaction.id);
      expect(interaction.components[0].artCompositionId).toBe(state.id);
      expect(state.components[0].artCompositionId).toBe(art.id);
      expect(parent.timeline.labels.map((label: { name: string }) => label.name)).toEqual(["Off", "On", "Appear", "Update", "Disappear"]);
      expect(interaction.timeline.labels.map((label: { name: string }) => label.name)).toEqual(["Default", "Down", "Up", "HoverIn", "HoverOut"]);
      expect(state.timeline.labels.map((label: { name: string }) => label.name)).toEqual(["Default", "Disabled"]);
      expect(art.timeline.labels.map((label: { name: string }) => label.name)).toEqual(["Default"]);
    }
  );

  it("moves a saved flat button into base art without retaining its legacy parent timeline", () => {
    const runtime = createRuntime();
    const manifest = {
      compositions: {
        "controller-primary-button": {
          name: "Saved Primary Button",
          surface: "controller",
          compositionKind: "gameObject",
          canvas: { width: 300, height: 78 },
          components: [{
            id: "saved-card",
            name: "Saved Card",
            kind: "shape",
            x: 150,
            y: 39,
            width: 300,
            height: 78,
            fillColor: "#ff00ff"
          }],
          timeline: {
            fps: 30,
            frameCount: 2,
            labels: [{ name: "LegacyPress", frame: 0 }],
            commands: [{ frame: 1, type: "stop" }],
            tracks: [{ targetId: "saved-card", keyframes: [{ frame: 0, props: { scale: 0.5 } }] }]
          }
        }
      }
    };
    const parentDefinition = defaultArtCompositions.find((composition: { id: string }) => composition.id === "controller-primary-button");
    const artDefinition = defaultArtCompositions.find((composition: { id: string }) => composition.id === "controller-primary-button-art");
    const parent = runtime.publicArtComposition(parentDefinition, manifest);
    const art = runtime.publicArtComposition(artDefinition, manifest);

    expect(parent.components).toHaveLength(1);
    expect(parent.components[0].artCompositionId).toBe("controller-primary-button-interaction");
    expect(parent.timeline.labels.map((label: { name: string }) => label.name)).toContain("Appear");
    expect(parent.timeline.labels.map((label: { name: string }) => label.name)).not.toContain("LegacyPress");
    expect(art.components[0]).toEqual(expect.objectContaining({ id: "saved-card", fillColor: "#ff00ff", instanceLabel: "savedCard" }));
  });
});
