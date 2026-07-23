"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createBundleGameData } = require("../server/content-game-data-runtime");
const { createContentMigrationRuntime } = require("../server/content-migration-runtime");
const { createGameReleaseValidator } = require("../server/game-readiness-runtime");
const { loadGameDefinition } = require("./game-build-runtime");

function assertOutputRoot(cwd, outputDirectory) {
  const outputRoot = path.resolve(cwd, outputDirectory);
  if (outputRoot === cwd || !outputRoot.startsWith(`${cwd}${path.sep}`)) {
    throw new Error("Migration output must remain inside the game workspace and cannot replace it");
  }
  if (fs.existsSync(outputRoot)) {
    if (!fs.statSync(outputRoot).isDirectory() || fs.readdirSync(outputRoot).length) {
      throw new Error(`Migration output is not an empty directory: ${path.relative(cwd, outputRoot)}`);
    }
  }
  return outputRoot;
}

function writeContentSnapshot(snapshot, options = {}) {
  if (!snapshot?.manifestBytes || !Array.isArray(snapshot.paths)) throw new Error("Migration output requires a valid content snapshot");
  const cwd = path.resolve(options.cwd || process.cwd());
  const outputRoot = assertOutputRoot(cwd, options.outputDirectory);
  const parentRoot = path.dirname(outputRoot);
  fs.mkdirSync(parentRoot, { recursive: true });
  const stagingRoot = fs.mkdtempSync(path.join(parentRoot, `.${path.basename(outputRoot)}.pop-party-migration-`));
  try {
    for (const logicalPath of snapshot.paths) {
      const filePath = path.join(stagingRoot, ...logicalPath.split("/"));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, snapshot.readBytes(logicalPath), { flag: "wx" });
    }
    fs.writeFileSync(path.join(stagingRoot, "content-bundle.json"), snapshot.manifestBytes(), { flag: "wx" });
    if (fs.existsSync(outputRoot)) fs.rmdirSync(outputRoot);
    fs.renameSync(stagingRoot, outputRoot);
  } catch (error) {
    fs.rmSync(stagingRoot, { force: true, recursive: true });
    throw error;
  }
  return outputRoot;
}

async function createGameMigration(options = {}) {
  const engineVersion = String(options.engineVersion || "").trim();
  if (!engineVersion) throw new Error("Game migration requires the running engine version");
  const loaded = loadGameDefinition(options);
  const contentStore = loaded.gameDefinition.content?.store;
  if (!contentStore || typeof contentStore.getActiveRelease !== "function" || typeof contentStore.loadPublishedRevision !== "function") {
    throw new Error("Game migration requires a configured content store");
  }
  const release = await contentStore.getActiveRelease();
  if (!release?.contentRevision) throw new Error("Game migration requires an active content revision");
  const sourceSnapshot = await contentStore.loadPublishedRevision(release.contentRevision);
  const validateRelease = createGameReleaseValidator({
    gameDefinition: loaded.gameDefinition,
    engineVersion,
    contentSchemaVersion: options.contentSchemaVersion || engineVersion
  });
  const migration = createContentMigrationRuntime({
    gameDefinition: loaded.gameDefinition,
    async validateSnapshot(snapshot) {
      const gameData = createBundleGameData(snapshot);
      await validateRelease({
        gameData,
        snapshot,
        release: {
          gameId: loaded.gameDefinition.gameId,
          gameBuild: loaded.gameDefinition.version,
          engineVersion,
          pluginVersion: loaded.gameDefinition.version,
          contentRevision: snapshot.revision,
          releaseRevision: `migration-preview:${snapshot.revision}`
        }
      });
    }
  });
  const preview = await migration.preview({ snapshot: sourceSnapshot, targetLevel: options.targetLevel });
  const outputRoot = options.outputDirectory
    ? writeContentSnapshot(preview.snapshot, { cwd: loaded.cwd, outputDirectory: options.outputDirectory })
    : null;
  return Object.freeze({ ...loaded, outputRoot, preview });
}

module.exports = Object.freeze({ assertOutputRoot, createGameMigration, writeContentSnapshot });
