import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { loadGameDefinition } = require("./game-build-runtime");

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe("game definition loading", () => {
  it("scopes the development content override to config evaluation", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-config-environment-"));
    roots.push(cwd);
    fs.writeFileSync(path.join(cwd, "game.config.js"), "module.exports = { contentRoot: process.env.POP_PARTY_CONTENT_ROOT };\n");
    const previous = process.env.POP_PARTY_CONTENT_ROOT;
    process.env.POP_PARTY_CONTENT_ROOT = "original";
    try {
      const loaded = loadGameDefinition({
        cwd,
        environment: { POP_PARTY_CONTENT_ROOT: path.join(cwd, ".pop-party", "content") }
      });
      expect(loaded.gameDefinition.contentRoot).toBe(path.join(cwd, ".pop-party", "content"));
      expect(process.env.POP_PARTY_CONTENT_ROOT).toBe("original");
      expect(() => loadGameDefinition({ cwd, environment: { HOME: cwd } })).toThrow(/Unsupported game config environment override/);
    } finally {
      if (previous === undefined) delete process.env.POP_PARTY_CONTENT_ROOT;
      else process.env.POP_PARTY_CONTENT_ROOT = previous;
    }
  });
});
