"use strict";

const { replaceSnapshotFiles } = require("./content-snapshot-runtime");

class ContentMigrationError extends Error {
  constructor(message, { code = "CONTENT_MIGRATION_FAILED", details = {} } = {}) {
    super(message);
    this.name = "ContentMigrationError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function migrationError(code, message, details = {}) {
  throw new ContentMigrationError(message, { code, details });
}

function normalizeLevel(value, label) {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 0) throw new Error(`${label} must be a non-negative integer`);
  return level;
}

function normalizeMigrationRegistration(registration) {
  const definition = registration?.value;
  if (!registration?.id || !definition || typeof definition !== "object") {
    throw new Error("Content migration registration must be an object");
  }
  const fromLevel = normalizeLevel(definition.fromLevel, `Migration ${registration.id} fromLevel`);
  const toLevel = normalizeLevel(definition.toLevel, `Migration ${registration.id} toLevel`);
  if (toLevel !== fromLevel + 1) throw new Error(`Migration ${registration.id} must advance exactly one level`);
  if (typeof definition.migrate !== "function") throw new Error(`Migration ${registration.id} must provide migrate`);
  return Object.freeze({
    allowNewFiles: definition.allowNewFiles === true,
    fromLevel,
    id: registration.id,
    migrate: definition.migrate,
    toEngineContentSchemaVersion: definition.toEngineContentSchemaVersion === undefined
      ? undefined
      : String(definition.toEngineContentSchemaVersion),
    toFlowExpressionLanguageVersion: definition.toFlowExpressionLanguageVersion === undefined
      ? undefined
      : normalizeLevel(definition.toFlowExpressionLanguageVersion, `Migration ${registration.id} toFlowExpressionLanguageVersion`),
    toLevel
  });
}

function changedPaths(before, after) {
  const beforeFiles = new Map(before.manifest.files.map((file) => [file.path, file.sha256]));
  const afterFiles = new Map(after.manifest.files.map((file) => [file.path, file.sha256]));
  return Object.freeze([...new Set([...beforeFiles.keys(), ...afterFiles.keys()])]
    .filter((logicalPath) => beforeFiles.get(logicalPath) !== afterFiles.get(logicalPath))
    .sort());
}

function migrationContext(snapshot, migration) {
  return Object.freeze({
    fromLevel: migration.fromLevel,
    gameId: snapshot.manifest.gameId,
    manifest: snapshot.manifest,
    readBytes: (logicalPath) => snapshot.readBytes(logicalPath),
    readJson: (logicalPath) => snapshot.readJson(logicalPath),
    revision: snapshot.revision,
    toLevel: migration.toLevel
  });
}

async function applyMigration(migration, snapshot) {
  async function candidate() {
    const result = await migration.migrate(migrationContext(snapshot, migration));
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      migrationError("CONTENT_MIGRATION_RESULT_INVALID", `Migration ${migration.id} did not return a result object`, { id: migration.id });
    }
    if (!result.replacements || typeof result.replacements !== "object" || Array.isArray(result.replacements)) {
      migrationError("CONTENT_MIGRATION_REPLACEMENTS_INVALID", `Migration ${migration.id} did not return replacements`, { id: migration.id });
    }
    return replaceSnapshotFiles(snapshot, result.replacements, {
      allowNewFiles: migration.allowNewFiles,
      manifestMetadata: {
        gameMigrationLevel: migration.toLevel,
        ...(migration.toEngineContentSchemaVersion === undefined ? {} : {
          engineContentSchemaVersion: migration.toEngineContentSchemaVersion
        }),
        ...(migration.toFlowExpressionLanguageVersion === undefined ? {} : {
          flowExpressionLanguageVersion: migration.toFlowExpressionLanguageVersion
        })
      }
    });
  }

  const first = await candidate();
  const second = await candidate();
  if (first.revision !== second.revision) {
    migrationError("CONTENT_MIGRATION_NONDETERMINISTIC", `Migration ${migration.id} produced different revisions for the same source`, {
      firstRevision: first.revision,
      id: migration.id,
      secondRevision: second.revision,
      sourceRevision: snapshot.revision
    });
  }
  return first;
}

function createContentMigrationRuntime(options = {}) {
  const registrations = options.gameDefinition?.registrations?.migrations || [];
  const migrations = registrations.map(normalizeMigrationRegistration);
  const byLevel = new Map();
  for (const migration of migrations) {
    if (byLevel.has(migration.fromLevel)) {
      throw new Error(`Multiple content migrations start at level ${migration.fromLevel}: ${byLevel.get(migration.fromLevel).id}, ${migration.id}`);
    }
    byLevel.set(migration.fromLevel, migration);
  }
  const validateSnapshot = typeof options.validateSnapshot === "function" ? options.validateSnapshot : async () => {};
  const latestLevel = migrations.reduce((level, migration) => Math.max(level, migration.toLevel), 0);

  async function preview(input = {}) {
    const source = input.snapshot;
    if (!source?.manifest || typeof source.readBytes !== "function") throw new Error("Content migration requires a source snapshot");
    const sourceLevel = normalizeLevel(source.manifest.gameMigrationLevel, "Source gameMigrationLevel");
    const targetLevel = input.targetLevel === undefined ? Math.max(sourceLevel, latestLevel) : normalizeLevel(input.targetLevel, "Target migration level");
    if (targetLevel < sourceLevel) {
      migrationError("CONTENT_MIGRATION_DOWNGRADE_UNSUPPORTED", "Content migrations cannot downgrade a bundle", { sourceLevel, targetLevel });
    }
    let current = source;
    const steps = [];
    while (current.manifest.gameMigrationLevel < targetLevel) {
      const migration = byLevel.get(current.manifest.gameMigrationLevel);
      if (!migration || migration.toLevel > targetLevel) {
        migrationError("CONTENT_MIGRATION_PATH_MISSING", "No complete content migration path reaches the requested level", {
          currentLevel: current.manifest.gameMigrationLevel,
          targetLevel
        });
      }
      const next = await applyMigration(migration, current);
      steps.push(Object.freeze({
        changedPaths: changedPaths(current, next),
        fromLevel: migration.fromLevel,
        id: migration.id,
        sourceRevision: current.revision,
        targetRevision: next.revision,
        toLevel: migration.toLevel
      }));
      current = next;
    }
    await validateSnapshot(current);
    return Object.freeze({
      changedPaths: Object.freeze([...new Set(steps.flatMap((step) => step.changedPaths))].sort()),
      snapshot: current,
      sourceLevel,
      sourceRevision: source.revision,
      steps: Object.freeze(steps),
      targetLevel,
      targetRevision: current.revision
    });
  }

  return Object.freeze({ latestLevel, migrations: Object.freeze(migrations), preview });
}

module.exports = Object.freeze({
  ContentMigrationError,
  applyMigration,
  createContentMigrationRuntime,
  normalizeMigrationRegistration
});
