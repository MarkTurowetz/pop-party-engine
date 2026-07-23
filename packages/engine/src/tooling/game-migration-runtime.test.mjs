import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { REQUIRED_CONTENT_PATHS } = require("../shared/content-bundle-schema");
const { buildManifest, createContentSnapshot } = require("../server/content-snapshot-runtime");
const { assertOutputRoot, writeContentSnapshot } = require("./game-migration-runtime");

const roots = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-migration-output-"));
  roots.push(root);
  return root;
}

function snapshot() {
  const files = new Map(REQUIRED_CONTENT_PATHS.map((logicalPath) => [logicalPath, Buffer.from(`{"path":${JSON.stringify(logicalPath)}}\n`)]));
  return createContentSnapshot({
    files,
    manifest: buildManifest({
      schemaVersion: 1,
      gameId: "migration-output-fixture",
      engineContentSchemaVersion: "1.0.0",
      flowExpressionLanguageVersion: 1,
      gameMigrationLevel: 1,
      semanticRolesPath: "semantic-roles.json"
    }, files)
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe("game migration output", () => {
  it("atomically writes an independent validated bundle directory", () => {
    const cwd = temporaryRoot();
    const source = snapshot();
    const outputRoot = writeContentSnapshot(source, { cwd, outputDirectory: "outputs/migrated" });

    expect(outputRoot).toBe(path.join(cwd, "outputs", "migrated"));
    expect(JSON.parse(fs.readFileSync(path.join(outputRoot, "content-bundle.json"), "utf8")).rootHash)
      .toBe(source.revision);
    expect(fs.readFileSync(path.join(outputRoot, "constants.json")))
      .toEqual(source.readBytes("constants.json"));
  });

  it("refuses workspace replacement, traversal, and non-empty output", () => {
    const cwd = temporaryRoot();
    expect(() => assertOutputRoot(cwd, ".")).toThrow(/cannot replace/);
    expect(() => assertOutputRoot(cwd, "../outside")).toThrow(/must remain inside/);
    fs.mkdirSync(path.join(cwd, "occupied"));
    fs.writeFileSync(path.join(cwd, "occupied", "keep.txt"), "keep");
    expect(() => writeContentSnapshot(snapshot(), { cwd, outputDirectory: "occupied" })).toThrow(/not an empty directory/);
    expect(fs.readFileSync(path.join(cwd, "occupied", "keep.txt"), "utf8")).toBe("keep");
  });
});
