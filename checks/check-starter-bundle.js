"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const gameDefinition = require("../apps/reference/game.config");
const { version: engineVersion } = require("../packages/engine/package.json");
const authoringSourceGameData = require("../apps/reference/authoring-source-game-data");
const { generateGame } = require("../packages/create-game/src/generate-game");
const { exportLegacyContentBundle } = require("@pop-party/engine/tooling");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");

const root = path.resolve(__dirname, "..");
const committedRoot = path.join(root, "packages", "create-game", "starter", "content");
const noticesPath = path.join(root, "packages", "create-game", "starter", "ASSET-NOTICES.json");
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
  exportLegacyContentBundle({
    root,
    outputRoot: reproducedRoot,
    gameDefinition: { ...gameDefinition, gameData: authoringSourceGameData },
    artManifestPath: "apps/reference/authoring/art-manifest.json",
    sourcePaths: {
      flow: "apps/reference/content/flow.json",
      constants: "apps/reference/content/constants.json",
      stageLayouts: "apps/reference/content/layouts/stage.json",
      controllerLayouts: "apps/reference/content/layouts/controller.json",
      hostAudios: "apps/reference/content/audio/host-audios.json"
    }
  });
  const committedInventory = inventory(committedRoot);
  const reproducedInventory = inventory(reproducedRoot);
  if (JSON.stringify(committedInventory) !== JSON.stringify(reproducedInventory)) {
    throw new Error("Committed starter bundle is not reproducible from the current reference snapshot");
  }
  const starterSnapshot = createLocalContentBundleProvider({ root: committedRoot }).loadPublishedRevision();
  const artManifest = JSON.parse(fs.readFileSync(path.join(committedRoot, "art", "manifest.json"), "utf8"));
  const notices = JSON.parse(fs.readFileSync(noticesPath, "utf8"));
  if (notices.license !== "CC0-1.0") throw new Error("Starter asset inventory must declare CC0-1.0");
  const noticeByBlob = new Map((notices.assets || []).map((asset) => [asset.blobPath, asset]));
  const manifestBlobPaths = new Set((artManifest.assets || []).map((asset) => asset.blobPath));
  if (noticeByBlob.size !== manifestBlobPaths.size || [...manifestBlobPaths].some((blobPath) => !noticeByBlob.has(blobPath))) {
    throw new Error("Every starter art blob must have exactly one asset notice");
  }
  for (const [blobPath, notice] of noticeByBlob) {
    const bytes = fs.readFileSync(path.join(committedRoot, ...blobPath.split("/")));
    if (sha256(bytes) !== notice.sha256) throw new Error(`Starter asset notice hash mismatch: ${blobPath}`);
  }
  const generatedRoot = path.join(temporaryRoot, "generated-game");
  generateGame({ displayName: "Starter Isolation Fixture", engineVersion, targetRoot: generatedRoot });
  const generatedContentRoot = path.join(generatedRoot, "content");
  const generatedSnapshot = createLocalContentBundleProvider({ root: generatedContentRoot }).loadPublishedRevision();
  if (generatedSnapshot.revision !== starterSnapshot.revision) throw new Error("Generated content bytes changed the starter root hash");
  if (generatedSnapshot.manifest.gameId !== "starter-isolation-fixture") throw new Error("Generated content did not receive its independent game id");
  if (!fs.readFileSync(path.join(generatedRoot, "STARTER-ASSET-NOTICES.json")).equals(fs.readFileSync(noticesPath))) {
    throw new Error("Generated game did not receive an independent copy of starter asset notices");
  }
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
