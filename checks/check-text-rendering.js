"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const filesToCheck = [
  "client/controller.js",
  "client/runtime/controllerActionBindings.ts",
  "client/runtime/controllerAvatarView.ts",
  "client/runtime/controllerChoiceInputView.ts",
  "client/runtime/controllerGlobalActionView.ts",
  "client/runtime/controllerHeartbeatRuntime.ts",
  "client/runtime/controllerLobbyView.ts",
  "client/runtime/controllerMicrophoneAccessView.ts",
  "client/runtime/controllerSetupBindings.ts",
  "client/runtime/controllerTextInputView.ts",
  "client/runtime/controllerVoiceInput.ts",
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

// Behavioural assertions (measureGameText / normalizeTextFieldElement defaults and
// fixed font sizing) live in client/runtime/textFit.test.ts now that text-fit is a
// TS module. This node check keeps the source-shape guards below.
const textFitSource = fs.readFileSync(path.join(repoRoot, "client/runtime/textFit.ts"), "utf8");
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
