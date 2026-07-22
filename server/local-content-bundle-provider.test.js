import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const schema = require("../shared/content-bundle-schema.js");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");

const tempRoots = [];

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function writeFixture(mutator = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-bundle-"));
  tempRoots.push(root);
  const files = schema.REQUIRED_CONTENT_PATHS.map((logicalPath) => {
    const bytes = Buffer.from(`${JSON.stringify({ path: logicalPath })}\n`);
    const filePath = path.join(root, ...logicalPath.split("/"));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, bytes);
    return { path: logicalPath, sha256: hash(bytes), bytes: bytes.length };
  });
  const manifest = {
    schemaVersion: 1,
    gameId: "example-game",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json",
    files,
    rootHash: hash(Buffer.from(schema.rootHashInput(files), "utf8"))
  };
  mutator({ root, files, manifest });
  fs.writeFileSync(path.join(root, "content-bundle.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("local content bundle provider", () => {
  it("loads and pins a fully verified immutable snapshot", () => {
    const { root, manifest } = writeFixture();
    const snapshot = createLocalContentBundleProvider({ root }).loadPublishedRevision(manifest.rootHash);

    expect(snapshot.revision).toBe(manifest.rootHash);
    expect(snapshot.readJson("flow.json")).toEqual({ path: "flow.json" });
    expect(() => snapshot.readJson("unlisted.json")).toThrow(/not declared/);
  });

  it("fails closed on changed bytes", () => {
    const { root } = writeFixture(({ root }) => {
      fs.writeFileSync(path.join(root, "flow.json"), "changed\n");
    });
    expect(() => createLocalContentBundleProvider({ root }).loadPublishedRevision()).toThrow(/byte size mismatch|SHA-256 mismatch/);
  });

  it("rejects symlinks even when they stay beneath the root", () => {
    const { root } = writeFixture(({ root }) => {
      const target = path.join(root, "real-flow.json");
      fs.renameSync(path.join(root, "flow.json"), target);
      fs.symlinkSync(target, path.join(root, "flow.json"));
    });
    expect(() => createLocalContentBundleProvider({ root }).loadPublishedRevision()).toThrow(/symlinks/);
  });
});
