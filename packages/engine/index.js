"use strict";

module.exports = Object.freeze({
  ...require("./src/server/game-definition-runtime"),
  ...require("./src/server/game-plugin-runtime"),
  contentSchema: require("./dist/shared/content-bundle-schema"),
  contentSnapshots: require("./dist/server/content-snapshot-runtime"),
  contentStores: require("./dist/server/revisioned-content-store-runtime"),
  createLocalContentBundleProvider: require("./dist/server/local-content-bundle-provider").createLocalContentBundleProvider,
  createGithubContentBundleStore: require("./dist/server/github-content-bundle-store").createGithubContentBundleStore,
  createGithubGitDataRuntime: require("./dist/server/github-git-data-runtime").createGithubGitDataRuntime,
  createGithubAppCredentialRuntime: require("./dist/server/github-app-credential-runtime").createGithubAppCredentialRuntime,
  createContentStoreEnvironmentRuntime: require("./dist/server/content-store-environment-runtime").createContentStoreEnvironmentRuntime,
  createRoomContentPinRuntime: require("./dist/server/room-content-pin-runtime").createRoomContentPinRuntime,
  createAdminAuthRuntime: require("./dist/server/admin-auth-runtime").createAdminAuthRuntime,
  createAdminAuditRuntime: require("./dist/server/admin-audit-runtime").createAdminAuditRuntime,
  createRuntimeCapabilityRuntime: require("./dist/server/runtime-capability-runtime").createRuntimeCapabilityRuntime,
  svgSafety: require("./dist/server/svg-sanitizer")
});
