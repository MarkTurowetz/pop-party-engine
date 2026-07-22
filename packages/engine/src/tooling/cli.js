"use strict";

const path = require("path");
const { createLocalContentBundleProvider } = require("../server/local-content-bundle-provider");

const HELP_TEXT = [
  "Usage: pop-party <command>",
  "",
  "Commands:",
  "  validate [content-directory]  Validate a complete local content bundle"
].join("\n");

function validateContentBundle(contentRoot, output = console) {
  const root = path.resolve(contentRoot || "content");
  const snapshot = createLocalContentBundleProvider({ root }).loadPublishedRevision();
  output.log(`Content bundle valid: ${snapshot.manifest.gameId}`);
  output.log(`Revision: ${snapshot.revision}`);
  output.log(`Files: ${snapshot.manifest.files.length}`);
  return snapshot;
}

function runCli(argv = process.argv.slice(2), options = {}) {
  const output = options.output || console;
  const cwd = path.resolve(options.cwd || process.cwd());
  const [command, argument] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    output.log(HELP_TEXT);
    return 0;
  }
  if (command !== "validate") {
    output.error(`Unknown pop-party command: ${command}`);
    output.error(HELP_TEXT);
    return 1;
  }
  try {
    validateContentBundle(path.resolve(cwd, argument || "content"), output);
    return 0;
  } catch (error) {
    output.error(`Content bundle invalid: ${error.message}`);
    return 1;
  }
}

module.exports = Object.freeze({ HELP_TEXT, runCli, validateContentBundle });
