"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  CONTENT_BUNDLE_MANIFEST_PATH,
  normalizeBundlePath,
  normalizeManifest,
  rootHashInput
} = require("../shared/content-bundle-schema");
const { createContentSnapshot } = require("./content-snapshot-runtime");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertContainedFile(root, logicalPath) {
  const normalizedPath = normalizeBundlePath(logicalPath);
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ...normalizedPath.split("/"));
  const relative = path.relative(absoluteRoot, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Bundle path escapes provider root: ${normalizedPath}`);
  }
  let cursor = absoluteRoot;
  for (const part of normalizedPath.split("/")) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`Bundle paths cannot contain symlinks: ${normalizedPath}`);
  }
  if (!fs.statSync(absolutePath).isFile()) throw new Error(`Bundle entry is not a file: ${normalizedPath}`);
  return absolutePath;
}

function createLocalContentBundleProvider(options = {}) {
  const root = path.resolve(options.root || "");
  const maxFileBytes = Number(options.maxFileBytes || 5 * 1024 * 1024);
  const maxBundleBytes = Number(options.maxBundleBytes || 25 * 1024 * 1024);
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Local content bundle root is not a directory: ${root}`);
  }

  function loadSnapshot() {
    const manifestPath = assertContainedFile(root, CONTENT_BUNDLE_MANIFEST_PATH);
    let rawManifest;
    try {
      rawManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      throw new Error(`Could not parse ${CONTENT_BUNDLE_MANIFEST_PATH}: ${error.message}`);
    }
    const manifest = normalizeManifest(rawManifest);
    const bytesByPath = new Map();
    let bundleBytes = 0;
    for (const file of manifest.files) {
      if (file.bytes > maxFileBytes) throw new Error(`Bundle file exceeds size limit: ${file.path}`);
      const absolutePath = assertContainedFile(root, file.path);
      const bytes = fs.readFileSync(absolutePath);
      bundleBytes += bytes.length;
      if (bundleBytes > maxBundleBytes) throw new Error("Content bundle exceeds total size limit");
      if (bytes.length !== file.bytes) throw new Error(`Bundle byte size mismatch: ${file.path}`);
      const actualHash = sha256(bytes);
      if (actualHash !== file.sha256) throw new Error(`Bundle SHA-256 mismatch: ${file.path}`);
      if (file.path.startsWith("blobs/")) {
        const fileNameHash = path.posix.basename(file.path).split(".")[0].toLowerCase();
        if (fileNameHash !== actualHash) throw new Error(`Content-addressed blob name does not match bytes: ${file.path}`);
      }
      bytesByPath.set(file.path, bytes);
    }
    const actualRootHash = sha256(Buffer.from(rootHashInput(manifest.files), "utf8"));
    if (actualRootHash !== manifest.rootHash) throw new Error("Content bundle rootHash mismatch");
    return createContentSnapshot({ manifest, files: bytesByPath });
  }

  function loadPublishedRevision(expectedRevision = "") {
    const snapshot = loadSnapshot();
    if (expectedRevision && expectedRevision !== snapshot.revision) {
      throw new Error(`Local content revision mismatch: expected ${expectedRevision}, found ${snapshot.revision}`);
    }
    return snapshot;
  }

  return Object.freeze({ kind: "local-bundle", loadPublishedRevision });
}

module.exports = { assertContainedFile, createLocalContentBundleProvider, sha256 };
