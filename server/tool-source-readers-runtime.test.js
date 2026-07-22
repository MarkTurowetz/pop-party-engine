import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createToolSourceReadersRuntime } = require("./tool-source-readers-runtime");

function runtime({ existing = [], readJsonFile = (file) => ({ file }) } = {}) {
  const normalize = (value) => ({ normalized: value });
  return createToolSourceReadersRuntime({
    artManifestFile: "art-local.json",
    controllerLayoutsFile: "controller-local.json",
    defaultControllerLayoutsFile: "controller-seed.json",
    defaultGameConstantsFile: "constants-seed.json",
    defaultGameFlowFile: "flow-seed.json",
    defaultHostAudiosFile: "audio-seed.json",
    defaultStageLayoutsFile: "stage-seed.json",
    gameConstantsFile: "constants-local.json",
    gameFlowFile: "flow-local.json",
    hostAudiosFile: "audio-local.json",
    normalizeControllerLayouts: normalize,
    normalizeGameConstants: normalize,
    normalizeHostAudios: normalize,
    normalizeStageLayouts: normalize,
    readJsonFile,
    sourceFileExists: (file) => existing.includes(file),
    stageLayoutsFile: "stage-local.json"
  });
}

describe("tool source reader provenance", () => {
  it("allows an absent optional art override but rejects an invalid existing manifest", () => {
    expect(runtime().readLocalArtManifestSource()).toEqual({});

    const readers = runtime({
      existing: ["art-local.json"],
      readJsonFile: () => []
    });
    expect(() => readers.readLocalArtManifestSource()).toThrow(/Art manifest must be a JSON object/);
  });

  it("uses a tracked game seed only when the optional local override is absent", () => {
    const readJsonFile = vi.fn((file) => ({ file }));
    const readers = runtime({ existing: ["flow-seed.json"], readJsonFile });

    expect(readers.readLocalGameFlowSource()).toEqual({ file: "flow-seed.json" });
    expect(readJsonFile).toHaveBeenCalledTimes(1);
  });

  it("does not hide a corrupt existing local source behind seed content", () => {
    const failure = new Error("invalid JSON");
    const readers = runtime({
      existing: ["flow-local.json", "flow-seed.json"],
      readJsonFile: (file) => {
        if (file === "flow-local.json") throw failure;
        return { file };
      }
    });

    expect(() => readers.readLocalGameFlowSource()).toThrow(failure);
  });

  it("fails when required seed content is absent or invalid", () => {
    expect(() => runtime().readDefaultGameFlowSource()).toThrow(/Required game content file is missing/);

    const failure = new Error("invalid seed JSON");
    const readers = runtime({
      existing: ["flow-seed.json"],
      readJsonFile: () => {
        throw failure;
      }
    });
    expect(() => readers.readDefaultGameFlowSource()).toThrow(failure);
  });

  it("normalizes both local and seeded structured sources", () => {
    const local = runtime({ existing: ["stage-local.json"] });
    expect(local.readLocalStageLayoutsSource()).toEqual({ normalized: { file: "stage-local.json" } });

    const seeded = runtime({ existing: ["stage-seed.json"] });
    expect(seeded.readLocalStageLayoutsSource()).toEqual({ normalized: { file: "stage-seed.json" } });
  });
});
