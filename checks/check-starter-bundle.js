"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const gameDefinition = require("../apps/reference/game.config");
const { generateGame } = require("../packages/create-game/src/generate-game");
const { exportLegacyContentBundle } = require("@pop-party/engine/tooling");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");

const root = path.resolve(__dirname, "..");
const committedRoot = path.join(root, "packages", "create-game", "starter", "content");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-starter-check-"));

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function inventory(directory) {
  const records = [];
  function visit(current, prefix = "") {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = path.join(current, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`Starter bundle contains a symlink: ${relativePath}`);
      if (stat.isDirectory()) visit(absolutePath, relativePath);
      else if (stat.isFile()) {
        const bytes = fs.readFileSync(absolutePath);
        records.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`Starter bundle contains an unsupported entry: ${relativePath}`);
    }
  }
  visit(directory);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

try {
  const reproducedRoot = path.join(temporaryRoot, "reproduced");
  exportLegacyContentBundle({ root, outputRoot: reproducedRoot, gameDefinition });
  const committedInventory = inventory(committedRoot);
  const reproducedInventory = inventory(reproducedRoot);
  if (JSON.stringify(committedInventory) !== JSON.stringify(reproducedInventory)) {
    throw new Error("Committed starter bundle is not reproducible from the current reference snapshot");
  }
  const starterSnapshot = createLocalContentBundleProvider({ root: committedRoot }).loadPublishedRevision();
  const generatedRoot = path.join(temporaryRoot, "generated-game");
  generateGame({ displayName: "Starter Isolation Fixture", engineVersion: "1.0.0", targetRoot: generatedRoot });
  const generatedContentRoot = path.join(generatedRoot, "content");
  const generatedSnapshot = createLocalContentBundleProvider({ root: generatedContentRoot }).loadPublishedRevision();
  if (generatedSnapshot.revision !== starterSnapshot.revision) throw new Error("Generated content bytes changed the starter root hash");
  if (generatedSnapshot.manifest.gameId !== "starter-isolation-fixture") throw new Error("Generated content did not receive its independent game id");
  const blobPath = starterSnapshot.paths.find((logicalPath) => logicalPath.startsWith("blobs/"));
  if (!blobPath) throw new Error("Canonical starter bundle has no copied art blob");
  const starterBlob = path.join(committedRoot, ...blobPath.split("/"));
  const generatedBlob = path.join(generatedContentRoot, ...blobPath.split("/"));
  const starterBytes = fs.readFileSync(starterBlob);
  fs.writeFileSync(generatedBlob, Buffer.from("game-owned-edit", "utf8"));
  if (!fs.readFileSync(starterBlob).equals(starterBytes)) throw new Error("Editing generated art changed the canonical starter asset");
  console.log(`Starter bundle reproducibility and isolation passed: ${starterSnapshot.revision} (${committedInventory.length} files).`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
