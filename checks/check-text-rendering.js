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
  },
  {
    pattern: /targetElement\.textContent/,
    message: "Do not read rendered SVG DOM text back into stage layout text state."
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

const normalizeTextField = globalThis.PartyGameTextFit?.normalizeTextFieldElement;
if (typeof normalizeTextField !== "function") {
  console.error("Text rendering regression check failed:");
  console.error("- shared PartyGameTextFit.normalizeTextFieldElement was not registered");
  process.exit(1);
}

const implicitFitField = normalizeTextField({ kind: "text", width: 400, height: 80 });
const explicitManualField = normalizeTextField({ kind: "text", width: 400, height: 80, autoFitText: false, fontSize: 48 });
if (implicitFitField.autoFitText !== true || explicitManualField.autoFitText !== false) {
  console.error("Text rendering regression check failed:");
  console.error("- layout text fields must auto-fit unless autoFitText is explicitly false");
  process.exit(1);
}

const fixedSmall = measure({ text: "STAGE", element: { width: 400, height: 80, fontSize: 12, autoFitText: true }, fallbackSize: 12 });
const fixedLarge = measure({ text: "STAGE", element: { width: 400, height: 80, fontSize: 48, autoFitText: true }, fallbackSize: 48 });
const multiline = measure({ text: "ONE\nTWO\nTHREE", element: { width: 80, height: 24, fontSize: 36, autoFitText: true }, fallbackSize: 36 });
if (Number(fixedSmall.fontSize) !== 12 || Number(fixedLarge.fontSize) !== 48 || Number(multiline.fontSize) !== 36) {
  console.error("Text rendering regression check failed:");
  console.error("- text rendering must use manual font size and ignore auto-fit shrinking");
  process.exit(1);
}

const textFitSource = fs.readFileSync(path.join(repoRoot, "client/text-fit.js"), "utf8");
if (/createElementNS/.test(textFitSource) || /dominant-baseline/.test(textFitSource) || /measureText/.test(textFitSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- plain text mode must not use SVG or canvas text measurement");
  process.exit(1);
}
if (!/display: "flex"/.test(textFitSource)
  || !/alignItems: "center"/.test(textFitSource)
  || !/justifyContent: "center"/.test(textFitSource)
  || !/overflow: "hidden"/.test(textFitSource)
  || !/whiteSpace: "pre-wrap"/.test(textFitSource)
  || !/target\.textContent = textValue/.test(textFitSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- plain text mode must render centered clipped HTML text");
  process.exit(1);
}

const layoutRuntimeSource = fs.readFileSync(path.join(repoRoot, "client/layout-runtime.js"), "utf8");
if (!/normalized === "presentation"\) return "stagepresentationtext"/.test(layoutRuntimeSource)
  && !/compact === "presentation"\) return "stagepresentationtext"/.test(layoutRuntimeSource)
  || (!/normalized === "prompt"\) return "stageprompttext"/.test(layoutRuntimeSource)
    && !/compact === "prompt"\) return "stageprompttext"/.test(layoutRuntimeSource))) {
  console.error("Text rendering regression check failed:");
  console.error("- legacy flow text targets must resolve to canonical stage layout text ids");
  process.exit(1);
}

const layoutNormalizerSource = fs.readFileSync(path.join(repoRoot, "server/layout-normalization-runtime.js"), "utf8");
if (!/autoFitText: false/.test(layoutNormalizerSource)
  || !/layoutTextArtCompositionId/.test(layoutNormalizerSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- server layout normalization must promote legacy layout text to fixed-size text art");
  process.exit(1);
}

const stageLayoutNormalizerSource = fs.readFileSync(path.join(repoRoot, "server/stage-layout-normalization-runtime.js"), "utf8");
const controllerLayoutNormalizerSource = fs.readFileSync(path.join(repoRoot, "server/controller-layout-normalization-runtime.js"), "utf8");
if (/mergeMissingDefaultElements/.test(stageLayoutNormalizerSource)
  || /mergeMissingDefaultElements/.test(controllerLayoutNormalizerSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- layout normalization must not resurrect deleted default layout elements");
  process.exit(1);
}

const artObjectSource = fs.readFileSync(path.join(repoRoot, "client/stage/art-object-visuals.js"), "utf8");
if (/querySelector\(":scope > \.art-label-text"\)/.test(artObjectSource)
  || !/renderLayoutTextField\(label,\s*textElement,\s*\{/.test(artObjectSource)
  || !/function renderedArtTextElement/.test(artObjectSource)
  || !/target\?\.clientWidth/.test(artObjectSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- art text must render into the full rendered label box through the canonical text field renderer");
  process.exit(1);
}

const artToolSource = fs.readFileSync(path.join(repoRoot, "client/tools/art/artCompositionModel.ts"), "utf8");
if (!/component\.autoFitText !== false/.test(artToolSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- Art Manager text auto-fit must default to true unless explicitly false");
  process.exit(1);
}

const artNormalizerSource = fs.readFileSync(path.join(repoRoot, "server/art-assets-runtime.js"), "utf8");
if (!/normalized\.autoFitText = source\.autoFitText !== false && base\.autoFitText !== false/.test(artNormalizerSource)) {
  console.error("Text rendering regression check failed:");
  console.error("- server art normalization must default missing text autoFitText to true");
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
