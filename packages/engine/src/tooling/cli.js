"use strict";

const path = require("path");
const enginePackage = require("../../package.json");
const { createLocalContentBundleProvider } = require("../server/local-content-bundle-provider");
const { createGameBuild } = require("./game-build-runtime");

const HELP_TEXT = [
  "Usage: pop-party <command>",
  "",
  "Commands:",
  "  validate [content-directory]  Validate a complete local content bundle",
  "  build [game-config]           Validate and write an immutable game build manifest"
].join("\n");

function validateContentBundle(contentRoot, output = console) {
  const root = path.resolve(contentRoot || "content");
  const snapshot = createLocalContentBundleProvider({ root }).loadPublishedRevision();
  output.log(`Content bundle valid: ${snapshot.manifest.gameId}`);
  output.log(`Revision: ${snapshot.revision}`);
  output.log(`Files: ${snapshot.manifest.files.length}`);
  return snapshot;
}

async function runCli(argv = process.argv.slice(2), options = {}) {
  const output = options.output || console;
  const cwd = path.resolve(options.cwd || process.cwd());
  const [command, argument] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    output.log(HELP_TEXT);
    return 0;
  }
  if (command !== "validate" && command !== "build") {
    output.error(`Unknown pop-party command: ${command}`);
    output.error(HELP_TEXT);
    return 1;
  }
  try {
    if (command === "validate") validateContentBundle(path.resolve(cwd, argument || "content"), output);
    else {
      const build = await createGameBuild({
        cwd,
        configPath: argument || "game.config.js",
        engineVersion: options.engineVersion || enginePackage.version,
        outputDirectory: options.outputDirectory || "dist"
      });
      output.log(`Game build valid: ${build.manifest.gameId}`);
      output.log(`Content revision: ${build.manifest.contentRevision}`);
      output.log(`Build manifest: ${path.relative(cwd, build.manifestPath)}`);
    }
    return 0;
  } catch (error) {
    output.error(`${command === "validate" ? "Content bundle" : "Game build"} invalid: ${error.message}`);
    return 1;
  }
}

module.exports = Object.freeze({ HELP_TEXT, runCli, validateContentBundle });
