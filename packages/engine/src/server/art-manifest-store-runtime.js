"use strict";

const fs = require("fs");
const path = require("path");

function createArtManifestStoreRuntime({
  directories = [],
  loadSource = null,
  manifestFile,
  normalizeManifest = (source) => source,
  writeSource = null
} = {}) {
  function normalize(source, label = "Art manifest") {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`${label} must be a JSON object`);
    }
    const manifest = normalizeManifest(source);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error(`${label} normalizer must return a JSON object`);
    }
    return manifest;
  }

  function readArtManifest() {
    let body;
    try {
      body = fs.readFileSync(manifestFile, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return normalize({});
      throw new Error(`Could not read art manifest at ${manifestFile}: ${error.message}`, { cause: error });
    }
    try {
      return normalize(JSON.parse(body));
    } catch (error) {
      throw new Error(`Art manifest at ${manifestFile} is invalid: ${error.message}`, { cause: error });
    }
  }

  function writeArtManifest(manifest) {
    const normalized = normalize(manifest);
    for (const directory of new Set([path.dirname(manifestFile), ...directories].filter(Boolean))) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const body = `${JSON.stringify(normalized, null, 2)}\n`;
    const tempFile = `${manifestFile}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(tempFile, "w", 0o600);
    try {
      fs.writeFileSync(fd, body);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempFile, manifestFile);
    return normalized;
  }

  async function loadArtManifest() {
    if (typeof loadSource !== "function") return readArtManifest();
    return normalize(await loadSource(), "Art manifest source");
  }

  async function saveArtManifest(manifest) {
    const normalized = normalize(manifest);
    if (typeof writeSource !== "function") return writeArtManifest(normalized);
    return normalize(await writeSource(normalized), "Saved art manifest");
  }

  return Object.freeze({ loadArtManifest, readArtManifest, saveArtManifest, writeArtManifest });
}

module.exports = Object.freeze({ createArtManifestStoreRuntime });
