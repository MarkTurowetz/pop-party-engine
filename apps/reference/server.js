"use strict";

const path = require("node:path");
const { createGameApplicationRuntime } = require("@pop-party/engine/server/application");
const gameDefinition = require("./game.config");

function referenceContentStoreEnvironment(env = process.env) {
  const deploymentChannel = String(env.PARTY_GAME_DEPLOYMENT_CHANNEL || "").trim().toLowerCase();
  if (deploymentChannel !== "preview") return env;
  return Object.freeze({
    ...env,
    PARTY_GAME_RELEASE_REF: env.PARTY_GAME_PREVIEW_RELEASE_REF || "heads/game-releases-preview"
  });
}

async function startReferenceApplication(options = {}) {
  const runtime = createGameApplicationRuntime({
    gameDefinition,
    workspaceRoot: path.resolve(__dirname, "../.."),
    contentRoot: path.join(__dirname, "content"),
    authoringRoot: path.join(__dirname, "content"),
    authoringRepository: "MarkTurowetz/pop-party-engine",
    authoringMode: process.env.PARTY_GAME_REMOTE_AUTHORING === "enabled"
      ? "live-prototype"
      : "standard",
    sessionContentMode: process.env.PARTY_GAME_REMOTE_AUTHORING === "enabled"
      ? "published-release"
      : "latest-saved-authoring",
    contentStoreEnvironment: referenceContentStoreEnvironment(process.env),
    webRoot: path.resolve(__dirname, "../.."),
    host: options.host || process.env.HOST || "0.0.0.0",
    port: options.port ?? Number(process.env.PORT || 3000)
  });
  await runtime.start();
  return runtime;
}

module.exports = Object.freeze({ referenceContentStoreEnvironment, startReferenceApplication });
