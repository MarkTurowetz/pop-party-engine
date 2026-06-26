"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const filesToCheck = [
  "client/controller.js",
  "client/controller-action-bindings.js",
  "client/controller-avatar-view.js",
  "client/controller-choice-input-view.js",
  "client/controller-global-action-view.js",
  "client/controller-heartbeat-runtime.js",
  "client/controller-lobby-view.js",
  "client/controller-microphone-access-view.js",
  "client/controller-setup-bindings.js",
  "client/controller-text-input-view.js",
  "client/controller-voice-input.js",
  "client/layout-runtime.js",
  "client/layout-tool.js",
  "client/stage-runtime.js",
  "client/stage/art-object-visuals.js",
  "client/stage/player-roster-renderer.js",
  "client/stage/visual-controllers.js",
  "client/stage/voting-card-visuals.js",
  "client/stage/widget-art-renderer.js"
];

const disallowedPatterns = [
  {
    pattern: /\.textContent\.trim\(\)/,
    message: "Do not read rendered DOM text back into layout/art state; use dataset.textFitSource or authored defaults."
  },
  {
    pattern: /target\.textContent\s*=\s*String\(value\s*\?\?\s*""\)/,
    message: "Controller/stage text fallbacks should route through the shared text renderer."
  },
  {
    pattern: /target\.textContent\s*=\s*(?:layoutDefaultText|stageLayoutTextDefault)\(/,
    message: "Layout defaults should render through the shared text renderer, not direct textContent writes."
  },
  {
    pattern: /dataset\.textFitSource[^;\n]*textContent/,
    message: "Never derive textFitSource from rendered textContent."
  }
];

const failures = [];

for (const relativeFile of filesToCheck) {
  const file = path.join(repoRoot, relativeFile);
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    disallowedPatterns.forEach(({ pattern, message }) => {
      if (!pattern.test(line)) return;
      failures.push(`${relativeFile}:${index + 1} ${message}`);
    });
  });
}

if (failures.length) {
  console.error("Text rendering regression check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Text rendering regression check passed.");
