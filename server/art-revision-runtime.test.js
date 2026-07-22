import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { compositionRevision } = require("./art-composition-dependency-runtime");
const { compositionSaveConflict, manifestRevision, revisionMatches } = require("./art-revision-runtime");

describe("Art Manager revision contracts", () => {
  it("creates stable manifest revisions and treats a missing expected revision as an unconditional write", () => {
    const manifest = { compositions: { answer: { name: "Answer" } } };

    expect(manifestRevision(manifest)).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestRevision(manifest)).toBe(manifestRevision(manifest));
    expect(manifestRevision({ compositions: {} })).not.toBe(manifestRevision(manifest));
    expect(revisionMatches({}, manifest)).toBe(true);
    expect(revisionMatches({ revision: ` ${manifestRevision(manifest)} ` }, manifest)).toBe(true);
    expect(revisionMatches({ revision: "stale" }, manifest)).toBe(false);
  });

  it("allows a stale manifest save when every touched composition still has its expected revision", () => {
    const currentComposition = { id: "answer", name: "Answer", components: [] };
    const conflict = compositionSaveConflict({
      payload: {
        revision: "stale",
        expectedCompositionRevisions: { answer: compositionRevision(currentComposition) }
      },
      manifest: { compositions: { answer: {} }, organization: { stage: {} } },
      compositionIds: ["answer"],
      currentCompositions: [currentComposition]
    });

    expect(conflict).toBeNull();
  });

  it("reports the touched compositions whose expected revisions are stale", () => {
    const manifest = { compositions: { answer: {}, prompt: {} } };
    const conflict = compositionSaveConflict({
      payload: {
        revision: "stale",
        expectedCompositionRevisions: { answer: "stale-answer" }
      },
      manifest,
      compositionIds: ["answer", "prompt"],
      currentCompositions: [
        { id: "answer", name: "Answer" },
        { id: "prompt", name: "Prompt" }
      ]
    });

    expect(conflict).toEqual({
      ok: false,
      error: "Art compositions changed; reload before saving",
      conflictCompositionIds: ["answer", "prompt"],
      compositionRevisions: {
        answer: compositionRevision({ id: "answer", name: "Answer" }),
        prompt: compositionRevision({ id: "prompt", name: "Prompt" })
      },
      revision: manifestRevision(manifest)
    });
  });
});
