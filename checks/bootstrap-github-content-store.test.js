import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const schema = require("../shared/content-bundle-schema");
const { buildManifest } = require("../server/content-snapshot-runtime");
const { bootstrapGithubContentStore, parseArguments } = require("./bootstrap-github-content-store");

const roots = [];

function bundleFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-bootstrap-"));
  roots.push(root);
  const files = new Map(schema.REQUIRED_CONTENT_PATHS.map((logicalPath) => [logicalPath, Buffer.from(`${JSON.stringify({ path: logicalPath })}\n`)]));
  const manifest = buildManifest({
    schemaVersion: 1,
    gameId: "example-game",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json"
  }, files);
  for (const [logicalPath, bytes] of files) {
    const filePath = path.join(root, ...logicalPath.split("/"));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, bytes);
  }
  fs.writeFileSync(path.join(root, "content-bundle.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("GitHub content store bootstrap", () => {
  it("requires the complete release tuple and explicit arguments", () => {
    expect(parseArguments(["--bundle", "bundle", "--game-build", "1057", "--engine-version", "1.0.0", "--plugin-version", "1.0.0"]))
      .toMatchObject({ apply: false, bundle: "bundle", gameBuild: "1057" });
    expect(() => parseArguments(["--bundle", "bundle"])).toThrow(/Missing required/);
    expect(() => parseArguments(["--unknown"])).toThrow(/Unknown argument/);
  });

  it("validates and reports the exact immutable revision without network access", async () => {
    const fixture = bundleFixture();
    const result = await bootstrapGithubContentStore({
      arguments: {
        apply: false,
        bundle: fixture.root,
        gameBuild: "1057",
        engineVersion: "1.0.0",
        pluginVersion: "1.0.0"
      }
    });
    expect(result).toMatchObject({
      status: "validated-dry-run",
      gameId: "example-game",
      contentRevision: fixture.manifest.rootHash,
      release: { gameBuild: "1057", engineVersion: "1.0.0", pluginVersion: "1.0.0" }
    });
  });
});
