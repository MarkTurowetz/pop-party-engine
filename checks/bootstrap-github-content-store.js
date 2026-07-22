"use strict";

const path = require("path");
const { createContentStoreEnvironmentRuntime } = require("../server/content-store-environment-runtime");
const { createLocalContentBundleProvider } = require("../server/local-content-bundle-provider");

function parseArguments(argv) {
  const result = { apply: false, bundle: "", engineVersion: "", gameBuild: "", pluginVersion: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") result.apply = true;
    else if (argument === "--bundle") result.bundle = String(argv[++index] || "");
    else if (argument === "--engine-version") result.engineVersion = String(argv[++index] || "");
    else if (argument === "--game-build") result.gameBuild = String(argv[++index] || "");
    else if (argument === "--plugin-version") result.pluginVersion = String(argv[++index] || "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  for (const key of ["bundle", "engineVersion", "gameBuild", "pluginVersion"]) {
    if (!result[key]) throw new Error(`Missing required --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return result;
}

async function bootstrapGithubContentStore(options) {
  const bundleRoot = path.resolve(options.cwd || process.cwd(), options.arguments.bundle);
  const snapshot = createLocalContentBundleProvider({ root: bundleRoot }).loadPublishedRevision();
  const release = {
    gameBuild: options.arguments.gameBuild,
    engineVersion: options.arguments.engineVersion,
    pluginVersion: options.arguments.pluginVersion
  };
  const summary = {
    apply: options.arguments.apply,
    bundleRoot,
    gameId: snapshot.manifest.gameId,
    contentRevision: snapshot.revision,
    release
  };
  if (!options.arguments.apply) return { ...summary, status: "validated-dry-run" };
  const environment = createContentStoreEnvironmentRuntime({
    env: options.env || process.env,
    isProduction: false,
    adminAuthMode: "github",
    validateSnapshot: options.validateSnapshot
  });
  if (!environment.contentStore) throw new Error("PARTY_GAME_CONTENT_STORE must be github when --apply is used");
  const initialized = await environment.contentStore.initialize({ initialSnapshot: snapshot, release });
  return { ...summary, status: "initialized", initialized };
}

async function main() {
  try {
    const argumentsValue = parseArguments(process.argv.slice(2));
    const result = await bootstrapGithubContentStore({ arguments: argumentsValue });
    console.log(JSON.stringify(result, null, 2));
    if (!argumentsValue.apply) console.log("Dry run only. Re-run with --apply after reviewing this exact revision and release tuple.");
  } catch (error) {
    console.error(`Content store bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { bootstrapGithubContentStore, parseArguments };
