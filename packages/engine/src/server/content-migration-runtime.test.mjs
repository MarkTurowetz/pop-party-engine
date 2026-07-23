import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { REQUIRED_CONTENT_PATHS } = require("../shared/content-bundle-schema");
const { buildManifest, createContentSnapshot } = require("./content-snapshot-runtime");
const { createContentMigrationRuntime } = require("./content-migration-runtime");

function snapshot(level = 0) {
  const files = new Map(REQUIRED_CONTENT_PATHS.map((logicalPath) => [logicalPath, Buffer.from("{}\n", "utf8")]));
  return createContentSnapshot({
    files,
    manifest: buildManifest({
      schemaVersion: 1,
      gameId: "migration-fixture",
      engineContentSchemaVersion: "1.0.0",
      flowExpressionLanguageVersion: 1,
      gameMigrationLevel: level,
      semanticRolesPath: "semantic-roles.json"
    }, files)
  });
}

function gameDefinition(migrations) {
  return {
    registrations: {
      migrations: migrations.map((value, index) => ({ id: `fixture.migration-${index}`, value }))
    }
  };
}

describe("content migration runtime", () => {
  it("builds a deterministic contiguous preview without mutating the source", async () => {
    const source = snapshot();
    const validated = [];
    const runtime = createContentMigrationRuntime({
      gameDefinition: gameDefinition([
        {
          fromLevel: 0,
          toLevel: 1,
          migrate({ readJson }) {
            return { replacements: { "constants.json": { ...readJson("constants.json"), migrated: 1 } } };
          }
        },
        {
          fromLevel: 1,
          toLevel: 2,
          toFlowExpressionLanguageVersion: 2,
          migrate() {
            return { replacements: { "flow.json": { migrated: 2 } } };
          }
        }
      ]),
      validateSnapshot(candidate) {
        validated.push(candidate.revision);
      }
    });

    const preview = await runtime.preview({ snapshot: source, targetLevel: 2 });

    expect(source.manifest.gameMigrationLevel).toBe(0);
    expect(source.readJson("constants.json")).toEqual({});
    expect(preview.sourceRevision).toBe(source.revision);
    expect(preview.targetRevision).not.toBe(source.revision);
    expect(preview.snapshot.manifest.gameMigrationLevel).toBe(2);
    expect(preview.snapshot.manifest.flowExpressionLanguageVersion).toBe(2);
    expect(preview.snapshot.readJson("constants.json")).toEqual({ migrated: 1 });
    expect(preview.snapshot.readJson("flow.json")).toEqual({ migrated: 2 });
    expect(preview.changedPaths).toEqual(["constants.json", "flow.json"]);
    expect(preview.steps.map((step) => step.id)).toEqual(["fixture.migration-0", "fixture.migration-1"]);
    expect(validated).toEqual([preview.targetRevision]);

    const repeated = await runtime.preview({ snapshot: preview.snapshot, targetLevel: 2 });
    expect(repeated.steps).toEqual([]);
    expect(repeated.targetRevision).toBe(preview.targetRevision);
  });

  it("rejects missing, duplicate, downgrade, and non-contiguous paths", async () => {
    expect(() => createContentMigrationRuntime({
      gameDefinition: gameDefinition([{ fromLevel: 0, toLevel: 2, migrate() {} }])
    })).toThrow(/advance exactly one level/);
    expect(() => createContentMigrationRuntime({
      gameDefinition: gameDefinition([
        { fromLevel: 0, toLevel: 1, migrate() { return { replacements: {} }; } },
        { fromLevel: 0, toLevel: 1, migrate() { return { replacements: {} }; } }
      ])
    })).toThrow(/Multiple content migrations/);

    const runtime = createContentMigrationRuntime({ gameDefinition: gameDefinition([]) });
    await expect(runtime.preview({ snapshot: snapshot(), targetLevel: 1 })).rejects.toMatchObject({
      code: "CONTENT_MIGRATION_PATH_MISSING"
    });
    await expect(runtime.preview({ snapshot: snapshot(1), targetLevel: 0 })).rejects.toMatchObject({
      code: "CONTENT_MIGRATION_DOWNGRADE_UNSUPPORTED"
    });
  });

  it("detects nondeterministic migration output before it can be written", async () => {
    let invocation = 0;
    const runtime = createContentMigrationRuntime({
      gameDefinition: gameDefinition([{
        fromLevel: 0,
        toLevel: 1,
        migrate() {
          invocation += 1;
          return { replacements: { "constants.json": { invocation } } };
        }
      }])
    });

    await expect(runtime.preview({ snapshot: snapshot(), targetLevel: 1 })).rejects.toMatchObject({
      code: "CONTENT_MIGRATION_NONDETERMINISTIC"
    });
  });
});
