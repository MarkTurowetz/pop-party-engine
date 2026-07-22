#!/usr/bin/env node
"use strict";

const path = require("path");
const { createLocalContentBundleProvider } = require("../server/local-content-bundle-provider");

const root = path.resolve(process.cwd(), process.argv[2] || "content");

try {
  const snapshot = createLocalContentBundleProvider({ root }).loadPublishedRevision();
  console.log(`Content bundle valid: ${snapshot.manifest.gameId}`);
  console.log(`Revision: ${snapshot.revision}`);
  console.log(`Files: ${snapshot.manifest.files.length}`);
} catch (error) {
  console.error(`Content bundle invalid: ${error.message}`);
  process.exitCode = 1;
}
