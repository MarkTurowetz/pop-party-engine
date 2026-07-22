import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGameReadinessRuntime } = require("./game-readiness-runtime");
const { coreSemanticRoleDefinitions } = require("../shared/semantic-role-schema");

function semanticFixture() {
  const roles = {};
  const compositions = {};
  for (const [index, [role, definition]] of Object.entries(coreSemanticRoleDefinitions).entries()) {
    const compositionId = `fixture-${index}`;
    const componentKind = definition.terminalKind === "composition" ? "" : definition.terminalKind;
    roles[role] = componentKind ? { compositionId, instancePath: ["target"] } : { compositionId };
    compositions[compositionId] = {
      surface: definition.surface,
      components: componentKind ? [{ id: "target", instanceLabel: "target", kind: componentKind }] : []
    };
  }
  return { roles, artManifest: { compositions } };
}

function fixture(overrides = {}) {
  const semantic = semanticFixture();
  const snapshot = {
    revision: "content-1",
    manifest: { gameId: "fixture-game", engineContentSchemaVersion: "1.0.0", semanticRolesPath: "semantic-roles.json" },
    readJson: vi.fn((logicalPath) => logicalPath === "art/manifest.json"
      ? semantic.artManifest
      : { schemaVersion: 1, roles: semantic.roles })
  };
  const release = {
    gameId: "fixture-game",
    gameBuild: "0.1.0",
    engineVersion: "1.0.0",
    pluginVersion: "0.1.0",
    contentRevision: "content-1",
    releaseRevision: "release-1",
    ...(overrides.release || {})
  };
  const game = {
    gameId: "fixture-game",
    version: "0.1.0",
    engineCompatibility: "1.0.0",
    semanticRoles: semantic.roles,
    registrations: { validators: overrides.validators || [] },
    content: {
      mode: "bundle",
      store: {
        getActiveRelease: vi.fn(async () => release),
        loadPublishedRevision: vi.fn(async () => snapshot)
      }
    },
    ...(overrides.game || {})
  };
  return { game, release, snapshot };
}

describe("game readiness runtime", () => {
  it("returns an immutable active tuple only after the entire bundle is compatible", async () => {
    const validator = vi.fn(async () => ({ ok: true }));
    const { game } = fixture({ validators: [{ id: "fixture.validate", value: validator }] });
    const runtime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    const result = await runtime.check();
    expect(result.release).toMatchObject({ gameId: "fixture-game", contentRevision: "content-1" });
    expect(result.semanticRoles).toEqual(semanticFixture().roles);
    expect(validator).toHaveBeenCalledOnce();
    expect(runtime.state.status).toBe("ready");
  });

  it("fails closed when the active release targets another engine", async () => {
    const { game } = fixture({ release: { engineVersion: "2.0.0" } });
    const runtime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(runtime.check()).rejects.toMatchObject({ code: "ACTIVE_RELEASE_ENGINE_MISMATCH" });
    expect(runtime.state).toMatchObject({ status: "failed", diagnostic: { code: "ACTIVE_RELEASE_ENGINE_MISMATCH" } });
  });

  it("fails closed on missing semantic roles and plugin validation errors", async () => {
    const { game, snapshot } = fixture({ validators: [{ id: "fixture.validate", value: () => ({ ok: false, diagnostics: ["bad"] }) }] });
    const semantic = semanticFixture();
    snapshot.readJson = (logicalPath) => logicalPath === "art/manifest.json"
      ? semantic.artManifest
      : { schemaVersion: 1, roles: {} };
    const rolesRuntime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(rolesRuntime.check()).rejects.toMatchObject({ code: "SEMANTIC_ROLE_REQUIRED_MISSING" });
    snapshot.readJson = (logicalPath) => logicalPath === "art/manifest.json"
      ? semantic.artManifest
      : { schemaVersion: 1, roles: semantic.roles };
    const validatorRuntime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(validatorRuntime.check()).rejects.toMatchObject({ code: "PLUGIN_VALIDATION_FAILED" });
  });
});
