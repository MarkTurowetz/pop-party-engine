import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildManifest } = require("./content-snapshot-runtime");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");
const { refreshLocalContentBundle } = require("./local-content-bundle-writer");
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("local content bundle writer", () => {
  it("rehashes game-owned files into a loadable independent revision", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-content-writer-"));
    temporaryRoots.push(root);
    const initialBytes = Buffer.from('{"value":1}\n');
    const requiredFiles = [
      "flow.json",
      "constants.json",
      "layouts/stage.json",
      "layouts/controller.json",
      "audio/host-audios.json",
      "art/manifest.json",
      "prompts/prompts.json",
      "game-data/runtime.json",
      "semantic-roles.json"
    ];
    const files = new Map();
    for (const logicalPath of requiredFiles) {
      const bytes = logicalPath === "constants.json" ? initialBytes : Buffer.from("{}\n");
      const absolutePath = path.join(root, logicalPath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, bytes);
      files.set(logicalPath, bytes);
    }
    const initialManifest = buildManifest({
      schemaVersion: 1,
      gameId: "writer-fixture",
      engineContentSchemaVersion: "1.0.0",
      flowExpressionLanguageVersion: 1,
      gameMigrationLevel: 0,
      semanticRolesPath: "semantic-roles.json"
    }, files);
    fs.writeFileSync(path.join(root, "content-bundle.json"), `${JSON.stringify(initialManifest, null, 2)}\n`);

    fs.writeFileSync(path.join(root, "constants.json"), '{"value":2}\n');
    const refreshed = refreshLocalContentBundle(root);
    const snapshot = createLocalContentBundleProvider({ root }).loadPublishedRevision();

    expect(refreshed.rootHash).not.toBe(initialManifest.rootHash);
    expect(snapshot.revision).toBe(refreshed.rootHash);
    expect(snapshot.readJson("constants.json")).toEqual({ value: 2 });
  });
});
