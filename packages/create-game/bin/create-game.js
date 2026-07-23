#!/usr/bin/env node
"use strict";

const path = require("path");
const { generateGame } = require("../src/generate-game");
const { HELP_TEXT, parseCreateGameArguments } = require("../src/cli-arguments");

try {
  const parsed = parseCreateGameArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(HELP_TEXT);
    process.exitCode = 0;
    return;
  }
  const result = generateGame({
    ...parsed,
    targetRoot: parsed.targetRoot || path.resolve(process.cwd(), resultName(parsed.displayName))
  });
  console.log(`Created ${result.displayName} at ${result.targetRoot}`);
  console.log(`Engine: @pop-party/engine@${result.engineVersion}`);
} catch (error) {
  console.error(`Could not create game: ${error.message}`);
  process.exitCode = 1;
}

function resultName(value) {
  return String(value || "game").trim().replace(/\s+/g, "-");
}
