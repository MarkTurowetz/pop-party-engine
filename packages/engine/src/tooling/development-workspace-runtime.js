"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createLocalContentBundleProvider } = require("../server/local-content-bundle-provider");
const { loadGameDefinition } = require("./game-build-runtime");
const { writeContentSnapshot } = require("./game-migration-runtime");

function resolveDevelopmentContentRoot(cwd, relativeRoot = ".pop-party/content") {
  const root = path.resolve(cwd, relativeRoot);
  if (root === cwd || !root.startsWith(`${cwd}${path.sep}`)) {
    throw new Error("Development content root must remain inside the game workspace and cannot replace it");
  }
  return root;
}

async function prepareDevelopmentWorkspace(options = {}) {
  const loaded = options.loaded || loadGameDefinition(options);
  const contentStore = loaded.gameDefinition.content?.store;
  if (!contentStore || typeof contentStore.getActiveRelease !== "function" || typeof contentStore.loadPublishedRevision !== "function") {
    throw new Error("Development workspace requires a configured source content store");
  }
  const contentRoot = resolveDevelopmentContentRoot(loaded.cwd, options.contentDirectory || ".pop-party/content");
  let seeded = false;
  if (!fs.existsSync(contentRoot) || (fs.statSync(contentRoot).isDirectory() && fs.readdirSync(contentRoot).length === 0)) {
    const release = await contentStore.getActiveRelease();
    if (!release?.contentRevision) throw new Error("Development workspace requires an active source content revision");
    const source = await contentStore.loadPublishedRevision(release.contentRevision);
    writeContentSnapshot(source, { cwd: loaded.cwd, outputDirectory: path.relative(loaded.cwd, contentRoot) });
    seeded = true;
  }
  const provider = createLocalContentBundleProvider({
    root: contentRoot,
    gameBuild: loaded.gameDefinition.version,
    engineVersion: loaded.gameDefinition.engineCompatibility,
    pluginVersion: loaded.gameDefinition.version
  });
  const snapshot = provider.loadPublishedRevision();
  if (snapshot.manifest.gameId !== loaded.gameDefinition.gameId) {
    throw new Error(`Development content belongs to another game: ${snapshot.manifest.gameId}`);
  }
  return Object.freeze({ contentRoot, loaded, revision: snapshot.revision, seeded });
}

module.exports = Object.freeze({ prepareDevelopmentWorkspace, resolveDevelopmentContentRoot });
