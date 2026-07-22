#!/usr/bin/env node
"use strict";

const path = require("path");
const { generateGame } = require("../src/generate-game");

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : "";
}

const argv = process.argv.slice(2);
const name = argv.find((value, index) => !value.startsWith("-") && argv[index - 1] !== "--engine-version" && argv[index - 1] !== "--output" && argv[index - 1] !== "--starter");

try {
  const result = generateGame({
    displayName: name,
    engineVersion: valueAfter(argv, "--engine-version") || "1.0.0",
    starterRoot: valueAfter(argv, "--starter") || undefined,
    targetRoot: valueAfter(argv, "--output") || path.resolve(process.cwd(), resultName(name))
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
