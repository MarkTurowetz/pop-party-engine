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
  for (const fileName of ["game-flow.json", "game-constants.json", "stage-layouts.json", "controller-layouts.json", "host-audios.json"]) {
    fs.writeFileSync(path.join(root, fileName), `${JSON.stringify({ source: fileName })}\n`);
  }
  fs.mkdirSync(path.join(root, "art", "default"), { recursive: true });
  fs.writeFileSync(path.join(root, "art", "art-manifest.json"), `${JSON.stringify({ compositions: {} })}\n`);
  fs.writeFileSync(path.join(root, "art", "default", "asset.svg"), "<svg></svg>\n");
  const gameDefinition = {
    gameId: "example-game",
    semanticRoles: { "engine.background": "example.background" },
    gameData: {
      multipleChoicePrompts: [{ id: "one", prompt: "One?", options: ["Yes"], correctAnswerIndex: 0 }],
      artAssets: [{ id: "asset", name: "Asset", category: "Test", use: "Test", defaultFile: "asset.svg" }]
    }
  };
  return { root, outputRoot, gameDefinition };
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
    expect(snapshot.readJson("semantic-roles.json").roles).toEqual({ "engine.background": "example.background" });
    expect(art.assets[0].blobPath).toMatch(/^blobs\/[a-f0-9]{64}\.svg$/);
    expect(snapshot.readBytes(art.assets[0].blobPath).toString()).toBe("<svg></svg>\n");
  });
});
