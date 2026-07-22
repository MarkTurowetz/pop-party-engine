import crypto from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createContentStoreEnvironmentRuntime } = require("./content-store-environment-runtime");

function githubEnv(overrides = {}) {
  const privateKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    PARTY_GAME_CONTENT_STORE: "github",
    PARTY_GAME_CONTENT_GITHUB_APP_ID: "123",
    PARTY_GAME_CONTENT_GITHUB_INSTALLATION_ID: "456",
    PARTY_GAME_CONTENT_GITHUB_PRIVATE_KEY: privateKey,
    PARTY_GAME_CONTENT_GITHUB_REPO: "owner/game",
    ...overrides
  };
}

describe("content store environment gate", () => {
  it("defaults to disabled without requiring credentials", () => {
    expect(createContentStoreEnvironmentRuntime({ env: {} })).toMatchObject({ enabled: false, mode: "disabled", remoteAuthoring: "disabled", contentStore: null });
  });

  it("constructs the GitHub provider without enabling authoring routes", () => {
    expect(createContentStoreEnvironmentRuntime({ env: githubEnv() })).toMatchObject({ enabled: true, mode: "github", remoteAuthoring: "disabled" });
  });

  it("fails closed on unsafe remote-authoring combinations", () => {
    expect(() => createContentStoreEnvironmentRuntime({ env: { PARTY_GAME_REMOTE_AUTHORING: "enabled" } })).toThrow(/requires the GitHub content store/);
    expect(() => createContentStoreEnvironmentRuntime({
      env: githubEnv({ PARTY_GAME_REMOTE_AUTHORING: "enabled" }),
      isProduction: true,
      adminAuthMode: "legacy-open"
    })).toThrow(/requires GitHub administrator authentication/);
  });
});
