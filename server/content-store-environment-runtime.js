"use strict";

const { createGithubAppCredentialRuntime } = require("./github-app-credential-runtime");
const { createGithubContentBundleStore } = require("./github-content-bundle-store");
const { createGithubGitDataRuntime } = require("./github-git-data-runtime");

function createContentStoreEnvironmentRuntime(options = {}) {
  const env = options.env || process.env;
  const mode = String(env.PARTY_GAME_CONTENT_STORE || "disabled").toLowerCase();
  const remoteAuthoring = String(env.PARTY_GAME_REMOTE_AUTHORING || "disabled").toLowerCase();
  if (!["disabled", "github"].includes(mode)) throw new Error(`Unsupported content store mode: ${mode}`);
  if (!["disabled", "enabled"].includes(remoteAuthoring)) throw new Error(`Unsupported remote authoring mode: ${remoteAuthoring}`);
  if (remoteAuthoring === "enabled" && mode !== "github") throw new Error("Remote authoring requires the GitHub content store");
  if (remoteAuthoring === "enabled" && options.isProduction && options.adminAuthMode !== "github") {
    throw new Error("Production remote authoring requires GitHub administrator authentication");
  }
  if (mode === "disabled") return Object.freeze({ mode, remoteAuthoring, contentStore: null, enabled: false });

  const credential = createGithubAppCredentialRuntime({
    appId: env.PARTY_GAME_CONTENT_GITHUB_APP_ID,
    installationId: env.PARTY_GAME_CONTENT_GITHUB_INSTALLATION_ID,
    privateKey: env.PARTY_GAME_CONTENT_GITHUB_PRIVATE_KEY,
    fetchImpl: options.fetchImpl
  });
  const git = createGithubGitDataRuntime({
    repo: env.PARTY_GAME_CONTENT_GITHUB_REPO,
    credentialProvider: credential.credential,
    fetchImpl: options.fetchImpl
  });
  const contentStore = createGithubContentBundleStore({
    git,
    baseRef: env.PARTY_GAME_CONTENT_BASE_REF || "heads/main",
    contentRef: env.PARTY_GAME_CONTENT_REF || "heads/game-data-v2",
    draftRefPrefix: env.PARTY_GAME_CONTENT_DRAFT_REF_PREFIX || "heads/game-drafts/",
    releaseRef: env.PARTY_GAME_RELEASE_REF || "heads/game-releases",
    validateSnapshot: options.validateSnapshot
  });
  return Object.freeze({ mode, remoteAuthoring, contentStore, enabled: true });
}

module.exports = { createContentStoreEnvironmentRuntime };
