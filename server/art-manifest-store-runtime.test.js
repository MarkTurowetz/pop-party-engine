import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtManifestStoreRuntime } = require("./art-manifest-store-runtime");
const temporaryRoots = [];

function createRuntime(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-art-manifest-"));
  temporaryRoots.push(root);
  const manifestFile = path.join(root, "art", "manifest.json");
  return {
    manifestFile,
    runtime: createArtManifestStoreRuntime({
      directories: [path.join(root, "art", "custom")],
      manifestFile,
      normalizeManifest: (source) => ({ ...source, normalized: true }),
      ...overrides
    })
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Art manifest store", () => {
  it("treats only a missing local manifest as an empty optional source", async () => {
    const { runtime } = createRuntime();

    expect(runtime.readArtManifest()).toEqual({ normalized: true });
    await expect(runtime.loadArtManifest()).resolves.toEqual({ normalized: true });
  });

  it("fails closed when an existing local manifest is corrupt", () => {
    const { manifestFile, runtime } = createRuntime();
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    fs.writeFileSync(manifestFile, "{not-json");

    expect(() => runtime.readArtManifest()).toThrow(/Art manifest .* is invalid/);
  });

  it("fails closed when an authoritative source does not return an object", async () => {
    const { runtime } = createRuntime({ loadSource: async () => [] });

    await expect(runtime.loadArtManifest()).rejects.toThrow("Art manifest source must be a JSON object");
  });

  it("atomically saves normalized local manifests and requires authoritative writes to return saved data", async () => {
    const { manifestFile, runtime } = createRuntime();
    await expect(runtime.saveArtManifest({ compositions: {} })).resolves.toEqual({ compositions: {}, normalized: true });
    expect(JSON.parse(fs.readFileSync(manifestFile, "utf8"))).toEqual({ compositions: {}, normalized: true });
    expect(fs.readdirSync(path.dirname(manifestFile))).toEqual(["custom", "manifest.json"]);

    const { runtime: invalidWriterRuntime } = createRuntime({ writeSource: async () => undefined });
    await expect(invalidWriterRuntime.saveArtManifest({})).rejects.toThrow("Saved art manifest must be a JSON object");
  });
});
