"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CONTENT_BUNDLE_MANIFEST_PATH } = require("../shared/content-bundle-schema");
const { buildManifest } = require("./content-snapshot-runtime");

function bundleFiles(root, directory = root, files = new Map()) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (relativePath === CONTENT_BUNDLE_MANIFEST_PATH) continue;
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) throw new Error(`Content bundle cannot contain symlinks: ${relativePath}`);
    if (stat.isDirectory()) bundleFiles(root, absolutePath, files);
    else if (stat.isFile()) files.set(relativePath, fs.readFileSync(absolutePath));
  }
  return files;
}

function refreshLocalContentBundle(rootInput, { trackLineage = true } = {}) {
  const root = path.resolve(rootInput || "");
  const manifestPath = path.join(root, CONTENT_BUNDLE_MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return null;
  const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const files = bundleFiles(root);
  const manifestSource = { ...current };
  if (trackLineage) {
    manifestSource.parentRevision = current.rootHash || current.parentRevision || "";
    manifestSource.publishedRevision = "";
  } else {
    delete manifestSource.parentRevision;
    delete manifestSource.publishedRevision;
  }
  const manifest = buildManifest(manifestSource, files);
  const temporaryPath = `${manifestPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, manifestPath);
  return manifest;
}

module.exports = Object.freeze({ bundleFiles, refreshLocalContentBundle });
