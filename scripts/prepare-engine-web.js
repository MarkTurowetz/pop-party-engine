"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "packages", "engine", "web");
const sharedRuntimeFiles = [
  "art-component-schema.js",
  "choice-input-action-config.js",
  "color-utils.js",
  "flow-action-registry.js",
  "game-constants-schema.js",
  "microphone-access-action-config.js",
  "text-answer-action-config.js"
];

function requiredPath(...parts) {
  const value = path.join(root, ...parts);
  if (!fs.existsSync(value)) throw new Error(`Engine web input is missing: ${path.relative(root, value)}`);
  return value;
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(requiredPath("index.html"), path.join(target, "index.html"));
fs.cpSync(requiredPath("client", "styles"), path.join(target, "client", "styles"), { recursive: true });
fs.mkdirSync(path.join(target, "client", "app", "legacy"), { recursive: true });
fs.copyFileSync(
  requiredPath("client", "app", "legacy", "app-shell.js"),
  path.join(target, "client", "app", "legacy", "app-shell.js")
);
fs.cpSync(requiredPath("dist", "client"), path.join(target, "dist", "client"), { recursive: true });
fs.mkdirSync(path.join(target, "shared"), { recursive: true });
for (const fileName of sharedRuntimeFiles) {
  fs.copyFileSync(requiredPath("shared", fileName), path.join(target, "shared", fileName));
}

console.log(`Prepared engine-owned browser application at ${path.relative(root, target)}.`);
