"use strict";

module.exports = Object.freeze({
  ...require("./src/server/game-definition-runtime"),
  ...require("./src/server/game-plugin-runtime"),
  server: require("./src/server"),
  contentSchema: require("./src/shared/content-bundle-schema"),
  semanticRoles: require("./src/shared/semantic-role-schema"),
  contentSnapshots: require("./src/server/content-snapshot-runtime"),
  createBundleGameData: require("./src/server/content-game-data-runtime").createBundleGameData,
  contentStores: require("./src/server/revisioned-content-store-runtime"),
  createLocalContentBundleProvider: require("./src/server/local-content-bundle-provider").createLocalContentBundleProvider,
  createGithubContentBundleStore: require("./src/server/github-content-bundle-store").createGithubContentBundleStore,
  createGithubGitDataRuntime: require("./src/server/github-git-data-runtime").createGithubGitDataRuntime,
  createGithubAppCredentialRuntime: require("./src/server/github-app-credential-runtime").createGithubAppCredentialRuntime,
  createContentStoreEnvironmentRuntime: require("./src/server/content-store-environment-runtime").createContentStoreEnvironmentRuntime,
  createContentAdminHandlersRuntime: require("./src/server/content-admin-handlers-runtime").createContentAdminHandlersRuntime,
  createRoomContentPinRuntime: require("./src/server/room-content-pin-runtime").createRoomContentPinRuntime,
  createAdminAuthRuntime: require("./src/server/admin-auth-runtime").createAdminAuthRuntime,
  createAdminAuditRuntime: require("./src/server/admin-audit-runtime").createAdminAuditRuntime,
  createRuntimeCapabilityRuntime: require("./src/server/runtime-capability-runtime").createRuntimeCapabilityRuntime,
  svgSafety: require("./src/server/svg-sanitizer")
});
