"use strict";

const crypto = require("crypto");
const {
  CONTENT_BUNDLE_MANIFEST_PATH,
  canonicalizeJson,
  normalizeBundlePath,
  normalizeManifest,
  rootHashInput
} = require("../shared/content-bundle-schema");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function normalizeFileMap(files) {
  if (files instanceof Map) return new Map([...files].map(([logicalPath, bytes]) => [normalizeBundlePath(logicalPath), Buffer.from(bytes)]));
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("Content snapshot files must be a map or object");
  return new Map(Object.entries(files).map(([logicalPath, bytes]) => [normalizeBundlePath(logicalPath), Buffer.from(bytes)]));
}

function buildManifest(metadata, files) {
  const records = [...files.entries()]
    .map(([logicalPath, bytes]) => ({ path: logicalPath, sha256: sha256(bytes), bytes: bytes.length }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return normalizeManifest({
    schemaVersion: metadata.schemaVersion,
    gameId: metadata.gameId,
    engineContentSchemaVersion: metadata.engineContentSchemaVersion,
    flowExpressionLanguageVersion: metadata.flowExpressionLanguageVersion,
    gameMigrationLevel: metadata.gameMigrationLevel,
    semanticRolesPath: metadata.semanticRolesPath,
    parentRevision: metadata.parentRevision || "",
    publishedRevision: metadata.publishedRevision || "",
    files: records,
    rootHash: sha256(Buffer.from(rootHashInput(records), "utf8"))
  });
}

function createContentSnapshot({ manifest: manifestInput, files: fileInput }) {
  const manifest = normalizeManifest(manifestInput);
  const files = normalizeFileMap(fileInput);
  if (files.has(CONTENT_BUNDLE_MANIFEST_PATH)) throw new Error("The content snapshot file map must not include its manifest");
  if (files.size !== manifest.files.length) throw new Error("Content snapshot file count does not match its manifest");
  for (const record of manifest.files) {
    const bytes = files.get(record.path);
    if (!bytes) throw new Error(`Content snapshot file is missing: ${record.path}`);
    if (bytes.length !== record.bytes) throw new Error(`Content snapshot byte size mismatch: ${record.path}`);
    if (sha256(bytes) !== record.sha256) throw new Error(`Content snapshot SHA-256 mismatch: ${record.path}`);
  }
  const actualRootHash = sha256(Buffer.from(rootHashInput(manifest.files), "utf8"));
  if (actualRootHash !== manifest.rootHash) throw new Error("Content snapshot rootHash mismatch");

  return Object.freeze({
    revision: manifest.rootHash,
    manifest,
    paths: Object.freeze(manifest.files.map((file) => file.path)),
    readBytes(logicalPath) {
      const normalizedPath = normalizeBundlePath(logicalPath);
      const bytes = files.get(normalizedPath);
      if (!bytes) throw new Error(`Content snapshot file is not declared: ${normalizedPath}`);
      return Buffer.from(bytes);
    },
    readJson(logicalPath) {
      const normalizedPath = normalizeBundlePath(logicalPath);
      try {
        return JSON.parse(this.readBytes(normalizedPath).toString("utf8"));
      } catch (error) {
        throw new Error(`Content snapshot JSON is invalid at ${normalizedPath}: ${error.message}`);
      }
    },
    manifestBytes() {
      return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
  });
}

function replaceSnapshotFiles(snapshot, replacements, options = {}) {
  if (!snapshot?.manifest || typeof snapshot.readBytes !== "function") throw new Error("A valid content snapshot is required");
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) throw new Error("Content replacements must be an object");
  const files = new Map(snapshot.paths.map((logicalPath) => [logicalPath, snapshot.readBytes(logicalPath)]));
  for (const [rawPath, value] of Object.entries(replacements)) {
    const logicalPath = normalizeBundlePath(rawPath);
    if (logicalPath === CONTENT_BUNDLE_MANIFEST_PATH) throw new Error("The content bundle manifest is generated, not replaced");
    if (!files.has(logicalPath) && options.allowNewFiles !== true) throw new Error(`Content replacement path is not declared: ${logicalPath}`);
    const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(`${canonicalizeJson(value)}\n`, "utf8");
    files.set(logicalPath, bytes);
  }
  const manifest = buildManifest({
    ...snapshot.manifest,
    parentRevision: snapshot.revision,
    publishedRevision: options.publishedRevision ?? snapshot.manifest.publishedRevision
  }, files);
  return createContentSnapshot({ manifest, files });
}

function snapshotFingerprint(snapshot) {
  return sha256(Buffer.from(canonicalizeJson({
    revision: snapshot.revision,
    gameId: snapshot.manifest.gameId,
    files: snapshot.manifest.files
  }), "utf8"));
}

module.exports = { buildManifest, createContentSnapshot, replaceSnapshotFiles, sha256, snapshotFingerprint };
