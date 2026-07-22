"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "engine");
const outputRoot = path.join(packageRoot, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "source-manifest.json"), "utf8"));

if (!Array.isArray(manifest) || !manifest.length) throw new Error("Engine source manifest must be a non-empty array");
fs.rmSync(outputRoot, { recursive: true, force: true });
for (const relativePath of manifest) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (!/^(server|shared)\/[A-Za-z0-9._/-]+\.js$/.test(normalized) || normalized.includes("..")) {
    throw new Error(`Unsafe engine source path: ${relativePath}`);
  }
  const source = path.join(root, ...normalized.split("/"));
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Engine source is missing: ${normalized}`);
  const target = path.join(outputRoot, ...normalized.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
console.log(`Engine package built from ${manifest.length} allowlisted modules.`);
