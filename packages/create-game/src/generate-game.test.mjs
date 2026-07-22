import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertExactEngineVersion, copyTree, gameIdFromName, generateGame } = require("./generate-game");
const roots = [];

function temporaryDirectory(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function starter() {
  const root = temporaryDirectory("pop-party-starter-");
  fs.mkdirSync(path.join(root, "blobs"));
  fs.writeFileSync(path.join(root, "blobs", "asset.bin"), Buffer.from([0, 1, 2, 255]));
  fs.writeFileSync(path.join(root, "content-bundle.json"), `${JSON.stringify({ gameId: "starter" }, null, 2)}\n`);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("create-game generator", () => {
  it("normalizes game ids and rejects dependency ranges", () => {
    expect(gameIdFromName("Flip 7")).toBe("flip-7");
    expect(assertExactEngineVersion("1.2.3")).toBe("1.2.3");
    expect(() => assertExactEngineVersion("^1.2.3")).toThrow(/exact semantic version/);
  });

  it("deep-copies starter bytes and pins the exact engine version", () => {
    const starterRoot = starter();
    const parent = temporaryDirectory("pop-party-game-");
    const targetRoot = path.join(parent, "flip-7");
    const result = generateGame({ displayName: "Flip 7", engineVersion: "1.0.0", starterRoot, targetRoot });

    expect(result.gameId).toBe("flip-7");
    expect(JSON.parse(fs.readFileSync(path.join(targetRoot, "package.json"), "utf8")).dependencies)
      .toEqual({ "@pop-party/engine": "1.0.0" });
    expect(fs.readFileSync(path.join(targetRoot, "content", "blobs", "asset.bin")))
      .toEqual(Buffer.from([0, 1, 2, 255]));
    expect(JSON.parse(fs.readFileSync(path.join(targetRoot, "content", "content-bundle.json"), "utf8")).gameId)
      .toBe("flip-7");

    fs.writeFileSync(path.join(targetRoot, "content", "blobs", "asset.bin"), Buffer.from([9]));
    expect(fs.readFileSync(path.join(starterRoot, "blobs", "asset.bin"))).toEqual(Buffer.from([0, 1, 2, 255]));
  });

  it("rejects symlinks and non-empty targets", () => {
    const source = starter();
    const outside = path.join(temporaryDirectory("pop-party-outside-"), "asset.txt");
    fs.writeFileSync(outside, "outside");
    fs.symlinkSync(outside, path.join(source, "linked.txt"));
    expect(() => copyTree(source, path.join(temporaryDirectory("pop-party-copy-"), "content"))).toThrow(/symlinks/);

    const targetRoot = temporaryDirectory("pop-party-existing-");
    fs.writeFileSync(path.join(targetRoot, "mine.txt"), "preserve");
    expect(() => generateGame({ displayName: "My Game", engineVersion: "1.0.0", starterRoot: source, targetRoot }))
      .toThrow(/not empty/);
    expect(fs.readFileSync(path.join(targetRoot, "mine.txt"), "utf8")).toBe("preserve");
  });

  it("leaves no partial game when starter copying fails", () => {
    const source = starter();
    const outside = path.join(temporaryDirectory("pop-party-outside-"), "asset.txt");
    fs.writeFileSync(outside, "outside");
    fs.symlinkSync(outside, path.join(source, "linked.txt"));
    const parent = temporaryDirectory("pop-party-atomic-");
    const targetRoot = path.join(parent, "new-game");

    expect(() => generateGame({ displayName: "New Game", engineVersion: "1.0.0", starterRoot: source, targetRoot }))
      .toThrow(/symlinks/);
    expect(fs.existsSync(targetRoot)).toBe(false);
    expect(fs.readdirSync(parent)).toEqual([]);
  });
});
