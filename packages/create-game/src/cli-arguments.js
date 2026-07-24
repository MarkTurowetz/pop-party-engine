"use strict";

const { version: DEFAULT_ENGINE_VERSION } = require("../package.json");

const HELP_TEXT = [
  "Usage: npm create @pop-party/game <name> [options]",
  "",
  "Options:",
  "  --engine-version <version>  Exact @pop-party/engine version",
  "  --output <directory>        Empty target directory",
  "  --starter <directory>       Alternate starter bundle (development/testing only)",
  "  --help                      Show this help"
].join("\n");

const VALUE_FLAGS = Object.freeze({
  "--engine-version": "engineVersion",
  "--output": "targetRoot",
  "--starter": "starterRoot"
});

function parseCreateGameArguments(argv = []) {
  const options = {};
  let displayName = "";
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index]);
    if (value === "--help" || value === "-h") return Object.freeze({ help: true });
    const equalsIndex = value.indexOf("=");
    const flag = equalsIndex > 0 ? value.slice(0, equalsIndex) : value;
    if (VALUE_FLAGS[flag]) {
      const flagValue = equalsIndex > 0 ? value.slice(equalsIndex + 1) : String(argv[index + 1] ?? "");
      if (!flagValue || (equalsIndex < 0 && flagValue.startsWith("-"))) throw new Error(`${flag} requires a value`);
      options[VALUE_FLAGS[flag]] = flagValue;
      if (equalsIndex < 0) index += 1;
      continue;
    }
    if (value.startsWith("-")) throw new Error(`Unknown create-game option: ${value}`);
    if (displayName) throw new Error(`Unexpected game name argument: ${value}`);
    displayName = value.trim();
  }
  if (!displayName) throw new Error("Game display name is required");
  return Object.freeze({
    displayName,
    engineVersion: options.engineVersion || DEFAULT_ENGINE_VERSION,
    starterRoot: options.starterRoot || undefined,
    targetRoot: options.targetRoot || undefined
  });
}

module.exports = Object.freeze({ HELP_TEXT, parseCreateGameArguments });
