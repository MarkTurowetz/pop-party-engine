import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { exportLegacyContentBundle } = require("./legacy-content-bundle-exporter");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");

const roots = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-legacy-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-export-"));
  fs.rmSync(outputRoot, { recursive: true, force: true });
  roots.push(root, outputRoot);
  const sources = {
    "game-flow.json": { states: [{ id: "lobby", actions: [] }, { id: "intro", actions: [] }], routeNodes: [] },
    "game-constants.json": { playerColors: ["#ffffff"] },
    "stage-layouts.json": { canvas: {}, global: { elements: [] }, states: [{ id: "lobby", elements: [] }] },
    "controller-layouts.json": { canvas: {}, global: { elements: [] }, states: [{ id: "join", elements: [] }] },
    "host-audios.json": { hostAudios: [] }
  };
  for (const [fileName, value] of Object.entries(sources)) {
    fs.writeFileSync(path.join(root, fileName), `${JSON.stringify(value)}\n`);
  }
  fs.mkdirSync(path.join(root, "art", "default"), { recursive: true });
  fs.writeFileSync(path.join(root, "art", "art-manifest.json"), `${JSON.stringify({ compositions: {} })}\n`);
  fs.writeFileSync(path.join(root, "art", "default", "asset.svg"), "<svg></svg>\n");
  const gameDefinition = {
    gameId: "example-game",
    semanticRoles: { "engine.background": "example.background" },
    gameData: {
      defaultArtCompositions: [],
      defaultGameConstants: {
        playerColors: ["#000000"],
        craftingTimerDuration: 30,
        startGameCountdownDuration: 1,
        pointsForCorrectAnswer: 200,
        gameTitle: "Example",
        numberOfRounds: 3,
        randomChanceTest: 0.5,
        speechToTextSendInputBuffer: 1,
        overrideFirstGameOfSession: false,
        customConstants: []
      },
      defaultStageLayouts: { global: { elements: [] } },
      multipleChoicePrompts: [{ id: "one", prompt: "One?", options: ["Yes"], correctAnswerIndex: 0 }],
      artAssets: [{ id: "asset", name: "Asset", category: "Test", use: "Test", defaultFile: "asset.svg" }],
      artGroups: [],
      availableFlowTransitions: []
    }
  };
  return {
    root,
    outputRoot,
    gameDefinition,
    sourcePaths: {
      flow: "game-flow.json",
      constants: "game-constants.json",
      stageLayouts: "stage-layouts.json",
      controllerLayouts: "controller-layouts.json",
      hostAudios: "host-audios.json"
    }
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("legacy content bundle exporter", () => {
  it("deep-copies legacy JSON, prompts, semantic roles, and art blobs into a valid bundle", () => {
    const options = fixture();
    const manifest = exportLegacyContentBundle(options);
    const snapshot = createLocalContentBundleProvider({ root: options.outputRoot }).loadPublishedRevision(manifest.rootHash);
    const art = snapshot.readJson("art/manifest.json");

    expect(snapshot.readJson("prompts/prompts.json").prompts).toHaveLength(1);
    expect(snapshot.readJson("constants.json").gameTitle).toBe("Example");
    expect(snapshot.readJson("semantic-roles.json").roles).toEqual({ "engine.background": "example.background" });
    expect(art.assets[0].blobPath).toMatch(/^blobs\/[a-f0-9]{64}\.svg$/);
    expect(snapshot.readBytes(art.assets[0].blobPath).toString()).toBe("<svg></svg>\n");
  });

  it("uses explicit tracked source paths instead of volatile legacy files", () => {
    const options = fixture();
    fs.mkdirSync(path.join(options.root, "tracked"), { recursive: true });
    fs.writeFileSync(
      path.join(options.root, "tracked", "flow.json"),
      `${JSON.stringify({ states: [{ id: "tracked", actions: [] }], routeNodes: [] })}\n`
    );
    const manifest = exportLegacyContentBundle({
      ...options,
      sourcePaths: { ...options.sourcePaths, flow: "tracked/flow.json" }
    });
    const snapshot = createLocalContentBundleProvider({ root: options.outputRoot }).loadPublishedRevision(manifest.rootHash);

    expect(snapshot.readJson("flow.json").states[0].id).toBe("tracked");
  });

  it("fails closed when any legacy source path is left implicit", () => {
    const options = fixture();
    delete options.sourcePaths.flow;

    expect(() => exportLegacyContentBundle(options))
      .toThrow(/requires an explicit flow source path/i);
    expect(fs.existsSync(options.outputRoot)).toBe(false);
  });
});
