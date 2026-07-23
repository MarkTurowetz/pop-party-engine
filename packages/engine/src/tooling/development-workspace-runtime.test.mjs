import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { REQUIRED_CONTENT_PATHS } = require("../shared/content-bundle-schema");
const { buildManifest, createContentSnapshot } = require("../server/content-snapshot-runtime");
const { prepareDevelopmentWorkspace, resolveDevelopmentContentRoot } = require("./development-workspace-runtime");

const roots = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-development-"));
  roots.push(root);
  return root;
}

function snapshot(gameId = "development-fixture") {
  const files = new Map(REQUIRED_CONTENT_PATHS.map((logicalPath) => [logicalPath, Buffer.from("{}\n")]));
  return createContentSnapshot({
    files,
    manifest: buildManifest({
      schemaVersion: 1,
      gameId,
      engineContentSchemaVersion: "1.0.0",
      flowExpressionLanguageVersion: 1,
      gameMigrationLevel: 0,
      semanticRolesPath: "semantic-roles.json"
    }, files)
  });
}

function loaded(cwd, source, calls) {
  return {
    cwd,
    configPath: path.join(cwd, "game.config.js"),
    gameDefinition: {
      gameId: "development-fixture",
      version: "0.1.0",
      engineCompatibility: "1.0.0",
      content: {
        store: {
          getActiveRelease() {
            calls.push("release");
            return { contentRevision: source.revision };
          },
          loadPublishedRevision(revision) {
            calls.push(`snapshot:${revision}`);
            return source;
          }
        }
      }
    }
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe("development content workspace", () => {
  it("seeds once from an immutable release and reuses the independent local copy", async () => {
    const cwd = temporaryRoot();
    const source = snapshot();
    const calls = [];
    const config = loaded(cwd, source, calls);

    const first = await prepareDevelopmentWorkspace({ loaded: config });
    const second = await prepareDevelopmentWorkspace({ loaded: config });

    expect(first.contentRoot).toBe(path.join(cwd, ".pop-party", "content"));
    expect(first.seeded).toBe(true);
    expect(first.revision).toBe(source.revision);
    expect(second.seeded).toBe(false);
    expect(second.revision).toBe(source.revision);
    expect(calls).toEqual(["release", `snapshot:${source.revision}`]);
  });

  it("rejects content-root traversal before reading or writing", () => {
    const cwd = temporaryRoot();
    expect(() => resolveDevelopmentContentRoot(cwd, ".")).toThrow(/cannot replace/);
    expect(() => resolveDevelopmentContentRoot(cwd, "../outside")).toThrow(/must remain inside/);
  });
});
