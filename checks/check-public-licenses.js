"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const inventoryFile = path.join(root, "THIRD_PARTY-LICENSES.json");
const reviewedLicenses = Object.freeze([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "MPL-2.0"
]);

function packageName(packagePath, metadata) {
  if (metadata.name) return String(metadata.name);
  return packagePath.split("node_modules/").at(-1);
}

function inventoryFromLock(lock) {
  const packages = Object.entries(lock.packages || {})
    .filter(([packagePath, metadata]) => packagePath.includes("node_modules/") && metadata.link !== true)
    .map(([packagePath, metadata]) => ({
      name: packageName(packagePath, metadata),
      version: String(metadata.version || ""),
      license: String(metadata.license || ""),
      resolved: String(metadata.resolved || "")
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
  const invalid = packages.filter((entry) => !entry.name || !entry.version || !reviewedLicenses.includes(entry.license));
  if (invalid.length) {
    throw new Error(`Unreviewed dependency licenses: ${invalid.map((entry) => `${entry.name}@${entry.version} (${entry.license || "missing"})`).join(", ")}`);
  }
  return { schemaVersion: 1, source: "package-lock.json", reviewedLicenses, packages };
}

function serializedInventory() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  return `${JSON.stringify(inventoryFromLock(lock), null, 2)}\n`;
}

function assertPublicLicenseFiles() {
  const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  if (!license.startsWith("MIT License\n") || !license.includes("Copyright (c) 2026 Mark Turowetz")) {
    throw new Error("Root MIT license is missing or malformed");
  }
  const notices = fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  if (!notices.includes("THIRD_PARTY-LICENSES.json") || !notices.includes("ASSET-NOTICES.json")) {
    throw new Error("Third-party notices must identify dependency and starter-asset inventories");
  }
  const expected = serializedInventory();
  if (process.argv.includes("--write")) fs.writeFileSync(inventoryFile, expected, "utf8");
  if (!fs.existsSync(inventoryFile) || fs.readFileSync(inventoryFile, "utf8") !== expected) {
    throw new Error("THIRD_PARTY-LICENSES.json is stale; run node checks/check-public-licenses.js --write");
  }
  console.log(`Public license inventory passed (${JSON.parse(expected).packages.length} locked packages).`);
}

assertPublicLicenseFiles();
