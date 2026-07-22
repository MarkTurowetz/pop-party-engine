"use strict";

const fs = require("fs");
const path = require("path");
const { rootHashInput } = require("../shared/content-bundle-schema");
const { sha256 } = require("./local-content-bundle-provider");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstExisting(root, candidates) {
  for (const candidate of candidates) {
    const resolved = path.resolve(root, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  throw new Error(`None of the legacy sources exist: ${candidates.join(", ")}`);
}

function writeBundleFile(outputRoot, logicalPath, value, records) {
  const absolutePath = path.join(outputRoot, ...logicalPath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.writeFileSync(absolutePath, bytes, { mode: 0o600 });
  records.push({ path: logicalPath, sha256: sha256(bytes), bytes: bytes.length });
}

function withDefaultBackgroundLayer(savedLayouts, defaultLayouts) {
  const layouts = JSON.parse(JSON.stringify(savedLayouts));
  const defaultBackgrounds = (defaultLayouts?.global?.elements || []).filter((element) => element.layoutLayer === "background");
  if (!layouts.global || typeof layouts.global !== "object") layouts.global = { id: "global", name: "Global Layout", elements: [] };
  if (!Array.isArray(layouts.global.elements)) layouts.global.elements = [];
  if (!layouts.global.elements.some((element) => element.layoutLayer === "background")) {
    layouts.global.elements.push(...JSON.parse(JSON.stringify(defaultBackgrounds)));
  }
  return layouts;
}

function withDefaultArtCompositions(savedManifest, defaultCompositions) {
  const compositions = { ...(savedManifest.compositions || {}) };
  for (const defaultComposition of defaultCompositions || []) {
    const id = String(defaultComposition?.id || "").trim();
    if (!id || compositions[id]) continue;
    const copy = JSON.parse(JSON.stringify(defaultComposition));
    delete copy.id;
    compositions[id] = copy;
  }
  return { ...savedManifest, compositions };
}

function exportLegacyContentBundle(options) {
  const root = path.resolve(options.root);
  const outputRoot = path.resolve(options.outputRoot);
  if (fs.existsSync(outputRoot)) {
    if (!options.force) throw new Error(`Bundle output already exists: ${outputRoot}`);
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const gameDefinition = options.gameDefinition;
  const gameData = gameDefinition.gameData;
  const records = [];
  writeBundleFile(outputRoot, "flow.json", readJson(firstExisting(root, ["game-flow.json", "game-flow.default.json"])), records);
  writeBundleFile(outputRoot, "constants.json", readJson(firstExisting(root, ["game-constants.json", "game-constants.default.json"])), records);
  writeBundleFile(
    outputRoot,
    "layouts/stage.json",
    withDefaultBackgroundLayer(
      readJson(firstExisting(root, ["stage-layouts.json", "stage-layouts.default.json"])),
      gameData.defaultStageLayouts
    ),
    records
  );
  writeBundleFile(outputRoot, "layouts/controller.json", readJson(firstExisting(root, ["controller-layouts.json", "controller-layouts.default.json"])), records);
  writeBundleFile(outputRoot, "audio/host-audios.json", readJson(firstExisting(root, ["host-audios.json", "host-audios.default.json"])), records);
  writeBundleFile(outputRoot, "prompts/prompts.json", { prompts: gameData.multipleChoicePrompts }, records);
  writeBundleFile(outputRoot, "semantic-roles.json", { schemaVersion: 1, roles: gameDefinition.semanticRoles }, records);

  const artManifest = withDefaultArtCompositions(
    readJson(firstExisting(root, ["art/art-manifest.json", "art-manifest.json"])),
    gameData.defaultArtCompositions
  );
  const assets = [];
  for (const asset of gameData.artAssets) {
    const sourcePath = firstExisting(root, [`art/default/${asset.defaultFile}`]);
    const bytes = fs.readFileSync(sourcePath);
    const digest = sha256(bytes);
    const extension = path.extname(asset.defaultFile).toLowerCase();
    const blobPath = `blobs/${digest}${extension}`;
    if (!records.some((record) => record.path === blobPath)) writeBundleFile(outputRoot, blobPath, bytes, records);
    assets.push({
      id: asset.id,
      name: asset.name,
      category: asset.category,
      use: asset.use,
      mimeType: extension === ".svg" ? "image/svg+xml" : "application/octet-stream",
      blobPath,
      sha256: digest,
      sourceName: asset.defaultFile
    });
  }
  writeBundleFile(outputRoot, "art/manifest.json", { ...artManifest, assets }, records);

  records.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    gameId: gameDefinition.gameId,
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json",
    files: records,
    rootHash: sha256(Buffer.from(rootHashInput(records), "utf8"))
  };
  fs.writeFileSync(path.join(outputRoot, "content-bundle.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

module.exports = Object.freeze({ exportLegacyContentBundle, withDefaultArtCompositions, withDefaultBackgroundLayer });
