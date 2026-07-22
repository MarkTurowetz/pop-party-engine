"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const filenames = [
  "choice-input-action-config.js",
  "flow-action-registry.js",
  "game-constants-schema.js",
  "microphone-access-action-config.js",
  "text-answer-action-config.js"
];

for (const filename of filenames) {
  fs.copyFileSync(
    path.join(root, "packages", "engine", "src", "shared", filename),
    path.join(root, "shared", filename)
  );
}
