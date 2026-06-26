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

const textFit = require(path.join(repoRoot, "client/text-fit.js"));
const measure = globalThis.PartyGameTextFit?.measureGameText || textFit?.measureGameText;
if (typeof measure !== "function") {
  console.error("Text rendering regression check failed:");
  console.error("- shared PartyGameTextFit.measureGameText was not registered");
  process.exit(1);
}

const fixedSmall = measure({
  text: "STAGE",
  element: { width: 400, height: 80, fontSize: 12, autoFitText: false },
  fallbackSize: 12
});
const fixedLarge = measure({
  text: "STAGE",
  element: { width: 400, height: 80, fontSize: 48, autoFitText: false },
  fallbackSize: 48
});
if (Number(fixedSmall.fontSize) !== 12 || Number(fixedLarge.fontSize) !== 48) {
  console.error("Text rendering regression check failed:");
  console.error("- measureGameText must respect manual font size when autoFitText is false");
  process.exit(1);
}

const textFitSource = fs.readFileSync(path.join(repoRoot, "client/text-fit.js"), "utf8");
if (!/createElementNS\(svgNamespace,\s*"svg"\)/.test(textFitSource) || !/dominant-baseline/.test(textFitSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- shared text rendering must use SVG centered baselines, not HTML line-box baselines");
  process.exit(1);
}

const artSchema = require(path.join(repoRoot, "shared/art-component-schema.js"));
const unnamedLabel = globalThis.PartyGameArtComponentSchema?.componentLabel?.({ kind: "text", name: "Text" })
  || artSchema?.componentLabel?.({ kind: "text", name: "Text" });
if (unnamedLabel !== "") {
  console.error("Text rendering regression check failed:");
  console.error("- art component names must not render as visible text without an explicit defaultText");
  process.exit(1);
}

console.log("Text rendering regression check passed.");
