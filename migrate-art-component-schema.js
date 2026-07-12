#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { migrateLegacyArtManifestSchema } = require("./shared/art-component-schema-migration");

const args = process.argv.slice(2);
const write = args.includes("--write");
const manifestArg = args.find((arg) => !arg.startsWith("--"));
if (!manifestArg) {
  console.error("Usage: node migrate-art-component-schema.js <art-manifest.json> [--write]");
  process.exit(2);
}

const manifestPath = path.resolve(manifestArg);
const source = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const { manifest, report } = migrateLegacyArtManifestSchema(source);
const summary = {
  ...report,
  manifestPath,
  mode: write ? "write" : "check"
};

if (write && report.changed) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${manifestPath}.pre-sprite-${timestamp}.bak`;
  const tempPath = `${manifestPath}.${process.pid}.tmp`;
  fs.copyFileSync(manifestPath, backupPath);
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, manifestPath);
  summary.backupPath = backupPath;
}

console.log(JSON.stringify(summary, null, 2));
