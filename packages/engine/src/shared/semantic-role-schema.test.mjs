import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  coreSemanticRoleDefinitions,
  requiredCoreSemanticRoles,
  semanticRoleTargetKey,
  validateSemanticRoleDocument
} = require("./semantic-role-schema");

function validFixture() {
  const roles = {};
  const compositions = {};
  for (const [index, [role, definition]] of Object.entries(coreSemanticRoleDefinitions).entries()) {
    const compositionId = `fixture-${index}`;
    const componentKind = definition.terminalKind === "composition" ? "" : definition.terminalKind;
    roles[role] = componentKind
      ? { compositionId, instancePath: ["target"] }
      : { compositionId };
    const components = (definition.requiredInstanceLabels || []).map((instanceLabel) => ({
      id: instanceLabel,
      instanceLabel,
      kind: "shape"
    }));
    if (componentKind) components.push({ id: "target", instanceLabel: "target", kind: componentKind });
    compositions[compositionId] = {
      surface: definition.surface,
      components
    };
  }
  return { document: { schemaVersion: 1, roles }, artManifest: { compositions } };
}

describe("semantic role schema", () => {
  it("validates every required engine role against authored composition and instance ownership", () => {
    const fixture = validFixture();
    const result = validateSemanticRoleDocument(fixture.document, fixture.artManifest);
    expect(Object.keys(result.roles)).toEqual(requiredCoreSemanticRoles);
    expect(semanticRoleTargetKey(result.roles["engine.stage.playerPointsPopupContainer"]))
      .toContain("#target");
  });

  it("rejects old string aliases, missing core roles, and unresolved component paths", () => {
    const fixture = validFixture();
    expect(() => validateSemanticRoleDocument({ schemaVersion: 1, roles: { legacy: "voting-card" } }, fixture.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_ID_INVALID" }));

    const missing = validFixture();
    delete missing.document.roles["engine.stage.votingCard"];
    expect(() => validateSemanticRoleDocument(missing.document, missing.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_REQUIRED_MISSING" }));

    const unresolved = validFixture();
    unresolved.document.roles["engine.stage.playerAnswerBubble"].instancePath = ["oldAnswerBubble"];
    expect(() => validateSemanticRoleDocument(unresolved.document, unresolved.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_PATH_UNRESOLVED" }));
  });

  it("rejects a points origin that is not the authored player-widget container", () => {
    const fixture = validFixture();
    const target = fixture.document.roles["engine.stage.playerPointsPopupContainer"];
    fixture.artManifest.compositions[target.compositionId].components[0].kind = "shape";
    expect(() => validateSemanticRoleDocument(fixture.document, fixture.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_KIND_MISMATCH" }));
  });

  it("rejects a mapped widget whose required text or child binding is absent", () => {
    const fixture = validFixture();
    const target = fixture.document.roles["engine.controller.submitControl"];
    fixture.artManifest.compositions[target.compositionId].components = [];
    expect(() => validateSemanticRoleDocument(fixture.document, fixture.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_BINDING_MISSING" }));
  });
});
