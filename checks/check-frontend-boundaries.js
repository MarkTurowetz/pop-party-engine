"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const runtimeEntryFiles = [
  "client/app/entries/stage.ts",
  "client/app/entries/controller.ts"
];

const allowedTypedGlobalAdapters = new Set([
  "client/app/context/toolContextAdapter.ts",
  // Flow, Constants, Host Audio, and Art are fully React (no adapters). Only the
  // Layout tool still uses a legacy bridge mount (last Phase 2 migration).
  "client/tools/layout/mountLayoutToolApp.tsx"
]);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listFiles(dir, extensions) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...listFiles(fullPath, extensions));
      continue;
    }
    if (extensions.includes(path.extname(entry.name))) output.push(fullPath);
  }
  return output;
}

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkRuntimeEntriesDoNotImportTools() {
  for (const entry of runtimeEntryFiles) {
    const source = read(entry);
    assert(
      !/from\s+["'][^"']*tools\//.test(source) && !/import\s*\(["'][^"']*tools\//.test(source),
      `${entry} must not import editor tool modules`
    );
  }
}

function checkTypedGlobalsStayInAdapters() {
  const files = listFiles(path.join(repoRoot, "client"), [".ts", ".tsx"]);
  const offenders = [];
  for (const file of files) {
    const rel = relative(file);
    if (allowedTypedGlobalAdapters.has(rel)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/PartyGame[A-Za-z0-9_]*\s*=/.test(source)) offenders.push(rel);
  }
  assert(
    !offenders.length,
    `new typed window.PartyGame* assignments must live in documented adapters: ${offenders.join(", ")}`
  );
}

try {
  checkRuntimeEntriesDoNotImportTools();
  checkTypedGlobalsStayInAdapters();
  console.log("Frontend boundary checks passed.");
} catch (error) {
  console.error("Frontend boundary checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
}
