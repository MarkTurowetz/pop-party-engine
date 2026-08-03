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
    expect(semanticRoleTargetKey(result.roles["engine.stage.votingCard"]))
      .toContain("fixture-");
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
    unresolved.document.roles["engine.stage.layoutText"].instancePath = ["oldText"];
    expect(() => validateSemanticRoleDocument(unresolved.document, unresolved.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_PATH_UNRESOLVED" }));
  });

  it("rejects a semantic role composition on the wrong surface", () => {
    const fixture = validFixture();
    const target = fixture.document.roles["engine.stage.layoutText"];
    fixture.artManifest.compositions[target.compositionId].surface = "controller";
    expect(() => validateSemanticRoleDocument(fixture.document, fixture.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_SURFACE_MISMATCH" }));
  });

  it("rejects a mapped widget whose required text or child binding is absent", () => {
    const fixture = validFixture();
    const target = fixture.document.roles["engine.controller.submitControl"];
    fixture.artManifest.compositions[target.compositionId].components = [];
    expect(() => validateSemanticRoleDocument(fixture.document, fixture.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_BINDING_MISSING" }));
  });

  it("validates required bindings through nested authored composition references", () => {
    const fixture = validFixture();
    const target = fixture.document.roles["engine.controller.submitControl"];
    fixture.artManifest.compositions[target.compositionId].components = [{
      id: "interaction-ref",
      instanceLabel: "interaction",
      kind: "reference",
      artCompositionId: "nested-submit-art"
    }];
    fixture.artManifest.compositions["nested-submit-art"] = {
      surface: "controller",
      components: [
        { id: "text", instanceLabel: "buttonText", kind: "text" },
        { id: "card", instanceLabel: "buttonCard", kind: "shape" }
      ]
    };

    expect(() => validateSemanticRoleDocument(fixture.document, fixture.artManifest)).not.toThrow();

    fixture.artManifest.compositions["nested-submit-art"].components.pop();
    expect(() => validateSemanticRoleDocument(fixture.document, fixture.artManifest))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_BINDING_MISSING" }));
  });
});
