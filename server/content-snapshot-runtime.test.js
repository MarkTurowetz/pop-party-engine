import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const schema = require("../shared/content-bundle-schema");
const { buildManifest, createContentSnapshot, replaceSnapshotFiles } = require("./content-snapshot-runtime");

function fixtureSnapshot() {
  const files = new Map(schema.REQUIRED_CONTENT_PATHS.map((logicalPath) => [
    logicalPath,
    Buffer.from(`${JSON.stringify({ path: logicalPath, value: 1 })}\n`)
  ]));
  const manifest = buildManifest({
    schemaVersion: 1,
    gameId: "example-game",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json"
  }, files);
  return createContentSnapshot({ manifest, files });
}

describe("immutable content snapshots", () => {
  it("verifies every byte and returns defensive copies", () => {
    const snapshot = fixtureSnapshot();
    const bytes = snapshot.readBytes("flow.json");
    bytes.fill(0);

    expect(snapshot.readJson("flow.json")).toMatchObject({ path: "flow.json", value: 1 });
    expect(snapshot.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a snapshot whose bytes do not match the manifest", () => {
    const snapshot = fixtureSnapshot();
    const files = new Map(snapshot.paths.map((logicalPath) => [logicalPath, snapshot.readBytes(logicalPath)]));
    files.set("flow.json", Buffer.from("changed\n"));
    expect(() => createContentSnapshot({ manifest: snapshot.manifest, files })).toThrow(/byte size mismatch|SHA-256 mismatch/);
  });

  it("creates a new root revision and records its immutable parent", () => {
    const snapshot = fixtureSnapshot();
    const next = replaceSnapshotFiles(snapshot, { "constants.json": { gameTitle: "New title" } });

    expect(next.revision).not.toBe(snapshot.revision);
    expect(next.manifest.parentRevision).toBe(snapshot.revision);
    expect(next.readJson("constants.json")).toEqual({ gameTitle: "New title" });
    expect(snapshot.readJson("constants.json")).toMatchObject({ path: "constants.json" });
  });
});
