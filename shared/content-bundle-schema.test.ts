import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const schema = require("./content-bundle-schema.js");

const hash = "a".repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    gameId: "example-game",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json",
    files: schema.REQUIRED_CONTENT_PATHS.map((path: string) => ({ path, sha256: hash, bytes: 2 })),
    rootHash: hash,
    ...overrides
  };
}

describe("content bundle schema", () => {
  it("canonicalizes object keys without changing array order", () => {
    expect(schema.canonicalizeJson({ z: [2, 1], a: { y: true, x: "ok" } })).toBe('{"a":{"x":"ok","y":true},"z":[2,1]}');
  });

  it("rejects self-hashing and portable path collisions", () => {
    expect(() => schema.normalizeManifest(manifest({
      files: [...manifest().files, { path: "content-bundle.json", sha256: hash, bytes: 2 }]
    }))).toThrow(/cannot hash itself/);
    expect(() => schema.normalizeManifest(manifest({
      files: [...manifest().files, { path: "FLOW.json", sha256: hash, bytes: 2 }]
    }))).toThrow(/colliding bundle path/);
  });

  it("requires every engine-owned content dataset explicitly", () => {
    expect(() => schema.normalizeManifest(manifest({ files: manifest().files.slice(1) }))).toThrow(/missing required file/);
  });

  it("produces stable non-recursive root hash input", () => {
    const normalized = schema.normalizeManifest(manifest());
    expect(schema.rootHashInput(normalized.files)).not.toContain("content-bundle.json");
    expect(schema.rootHashInput([...normalized.files].reverse())).toBe(schema.rootHashInput(normalized.files));
  });
});
