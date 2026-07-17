#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  migrateLegacyArtManifestSchema,
  normalizeCurrentArtManifestGeometry
} = require("./shared/art-component-schema-migration");

const args = process.argv.slice(2);
const write = args.includes("--write");
const manifestArg = args.find((arg) => !arg.startsWith("--"));
if (!manifestArg) {
  console.error("Usage: node migrate-art-component-schema.js <art-manifest.json> [--write]");
  process.exit(2);
}

const manifestPath = path.resolve(manifestArg);
const source = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const migrated = migrateLegacyArtManifestSchema(source);
const normalized = normalizeCurrentArtManifestGeometry(migrated.manifest);
const manifest = normalized.manifest;
const report = {
  changed: migrated.report.changed || normalized.report.changed,
  spriteCount: migrated.report.spriteCount + normalized.report.spriteCount,
  avatarFrameShapeCount: migrated.report.avatarFrameShapeCount + normalized.report.avatarFrameShapeCount,
  centeredComponentCount: migrated.report.centeredComponentCount + normalized.report.centeredComponentCount,
  resizedCompositionCount: migrated.report.resizedCompositionCount + normalized.report.resizedCompositionCount,
  compositionIds: [...new Set([...migrated.report.compositionIds, ...normalized.report.compositionIds])]
};
const summary = {
  ...report,
  manifestPath,
  mode: write ? "write" : "check"
};

if (write && report.changed) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${manifestPath}.pre-schema-${timestamp}.bak`;
  const tempPath = `${manifestPath}.${process.pid}.tmp`;
  fs.copyFileSync(manifestPath, backupPath);
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, manifestPath);
  summary.backupPath = backupPath;
}

console.log(JSON.stringify(summary, null, 2));
