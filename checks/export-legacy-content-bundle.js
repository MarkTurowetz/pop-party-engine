#!/usr/bin/env node
"use strict";

const path = require("path");
const gameDefinition = require("../game.config");
const { exportLegacyContentBundle } = require("../server/legacy-content-bundle-exporter");

const outputFlag = process.argv.indexOf("--output");
const outputRoot = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.cwd(), process.argv[outputFlag + 1])
  : path.resolve(process.cwd(), "outputs", "reference-content-bundle");

try {
  const manifest = exportLegacyContentBundle({
    root: process.cwd(),
    outputRoot,
    gameDefinition,
    force: process.argv.includes("--force")
  });
  console.log(`Legacy content exported: ${outputRoot}`);
  console.log(`Revision: ${manifest.rootHash}`);
  console.log(`Files: ${manifest.files.length}`);
} catch (error) {
  console.error(`Legacy content export failed: ${error.message}`);
  process.exitCode = 1;
}
