import { afterEach, describe, expect, it } from "vitest";
import {
  runtimeSemanticCompositionId,
  runtimeSemanticInstanceLabel,
  runtimeSemanticRoleTarget
} from "./semanticRoleRuntime";

afterEach(() => {
  delete globalThis.__POP_PARTY_RUNTIME_CONFIG__;
});

describe("runtime semantic roles", () => {
  it("resolves game-owned compositions and nested instance labels", () => {
    globalThis.__POP_PARTY_RUNTIME_CONFIG__ = {
      semanticRoles: {
        "engine.stage.votingCard": { compositionId: "game-voting-card" },
        "reference.stage.playerDecoration": {
          compositionId: "game-player-widget",
          instancePath: ["pointsOrigin"]
        }
      }
    };
    expect(runtimeSemanticCompositionId("engine.stage.votingCard")).toBe("game-voting-card");
    expect(runtimeSemanticInstanceLabel("reference.stage.playerDecoration")).toBe("pointsOrigin");
  });

  it("fails closed instead of substituting a hard-coded or legacy object", () => {
    globalThis.__POP_PARTY_RUNTIME_CONFIG__ = { semanticRoles: {} };
    expect(() => runtimeSemanticRoleTarget("engine.stage.votingCard"))
      .toThrowError(expect.objectContaining({ code: "SEMANTIC_ROLE_RUNTIME_TARGET_MISSING" }));
  });
});
