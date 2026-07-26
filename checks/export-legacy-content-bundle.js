#!/usr/bin/env node
"use strict";

const path = require("path");
const gameDefinition = require("../apps/reference/game.config");
const authoringSourceGameData = require("../apps/reference/authoring-source-game-data");
const { exportLegacyContentBundle } = require("../server/legacy-content-bundle-exporter");

const outputFlag = process.argv.indexOf("--output");
const outputRoot = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.cwd(), process.argv[outputFlag + 1])
  : path.resolve(process.cwd(), "outputs", "reference-content-bundle");

try {
  const manifest = exportLegacyContentBundle({
    root: process.cwd(),
    outputRoot,
    gameDefinition: { ...gameDefinition, gameData: authoringSourceGameData },
    artManifestPath: "apps/reference/content/art/manifest.json",
    sourcePaths: {
      flow: "apps/reference/content/flow.json",
      constants: "apps/reference/content/constants.json",
      stageLayouts: "apps/reference/content/layouts/stage.json",
      controllerLayouts: "apps/reference/content/layouts/controller.json",
      hostAudios: "apps/reference/content/audio/host-audios.json"
    },
    force: process.argv.includes("--force")
  });
  console.log(`Legacy content exported: ${outputRoot}`);
  console.log(`Revision: ${manifest.rootHash}`);
  console.log(`Files: ${manifest.files.length}`);
} catch (error) {
  console.error(`Legacy content export failed: ${error.message}`);
  process.exitCode = 1;
}
