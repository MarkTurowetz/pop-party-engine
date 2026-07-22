"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const filenames = [
  "art-component-schema.js",
  "color-utils.js",
  "choice-input-action-config.js",
  "flow-action-registry.js",
  "game-constants-schema.js",
  "lifecycle-labels.d.ts",
  "lifecycle-labels.js",
  "microphone-access-action-config.js",
  "timeline-model.d.ts",
  "timeline-model.js",
  "art-timeline-architecture.d.ts",
  "art-timeline-architecture.js",
  "text-answer-action-config.js"
];

for (const filename of filenames) {
  fs.copyFileSync(
    path.join(root, "packages", "engine", "src", "shared", filename),
    path.join(root, "shared", filename)
  );
}
