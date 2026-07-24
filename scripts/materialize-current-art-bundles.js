"use strict";

const fs = require("node:fs");
const path = require("node:path");
const gameData = require("../apps/reference/game-data");
const { createArtAssetsRuntime } = require("../packages/engine/src/server/application/art-assets-runtime");
const { refreshLocalContentBundle } = require("../packages/engine/src/server/local-content-bundle-writer");
const { ART_COMPONENT_SCHEMA_VERSION } = require("../packages/engine/src/shared/art-component-schema-migration");
const { version: engineVersion } = require("../packages/engine/package.json");

const root = path.resolve(__dirname, "..");
const authoringManifestPath = path.join(root, "apps", "reference", "authoring", "art-manifest.json");
const referenceContentRoot = path.join(root, "apps", "reference", "content");
const starterContentRoot = path.join(root, "packages", "create-game", "starter", "content");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function refreshCanonicalBundle(contentRoot) {
  const bundlePath = path.join(contentRoot, "content-bundle.json");
  const bundle = readJson(bundlePath);
  writeJson(bundlePath, { ...bundle, engineContentSchemaVersion: engineVersion });
  refreshLocalContentBundle(contentRoot, { trackLineage: false });
}

async function normalizedManifest(source, manifestFile) {
  let response = null;
  const runtime = createArtAssetsRuntime({
    acceptedArtTypes: gameData.acceptedArtTypes,
    artCompositions: gameData.defaultArtCompositions,
    artAssets: gameData.artAssets,
    artGroups: gameData.artGroups,
    artRoot: path.join(root, "art"),
    contentTypeForFile: () => "application/octet-stream",
    customDir: path.join(root, "art", "custom"),
    defaultDir: path.join(root, "art", "default"),
    loadArtManifestSource: async () => structuredClone(source),
    localDraftStore: {},
    manifestFile,
    readJson: async () => ({}),
    sendJson(_response, status, payload) {
      response = { status, payload };
    }
  });
  await runtime.sendArtAssetList({});
  if (response?.status !== 200 || !Array.isArray(response.payload?.compositions)) {
    throw new Error("Could not materialize current art compositions");
  }
  return {
    ...source,
    artComponentSchemaVersion: ART_COMPONENT_SCHEMA_VERSION,
    compositions: Object.fromEntries(response.payload.compositions.map(({ id, ...composition }) => [id, composition])),
    organization: response.payload.organization
  };
}

async function main() {
  const referenceManifestPath = path.join(referenceContentRoot, "art", "manifest.json");
  const referenceSource = readJson(referenceManifestPath);
  const referenceManifest = await normalizedManifest(referenceSource, referenceManifestPath);
  writeJson(referenceManifestPath, referenceManifest);
  refreshCanonicalBundle(referenceContentRoot);

  const { assets: _portableAssets, ...authoringManifest } = referenceManifest;
  writeJson(authoringManifestPath, authoringManifest);

  const starterManifestPath = path.join(starterContentRoot, "art", "manifest.json");
  writeJson(starterManifestPath, referenceManifest);
  refreshCanonicalBundle(starterContentRoot);

  console.log(`Materialized ${Object.keys(referenceManifest.compositions).length} current art compositions into both game-owned bundles.`);
}

main().catch((error) => {
  console.error(`Current art materialization failed: ${error.message}`);
  process.exitCode = 1;
});
