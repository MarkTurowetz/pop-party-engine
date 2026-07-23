import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { REQUIRED_CONTENT_PATHS, rootHashInput } = require("../shared/content-bundle-schema");
const { migrationArguments, runCli, serviceArguments } = require("./cli");

const temporaryRoots = [];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validBundle() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-cli-"));
  temporaryRoots.push(root);
  const records = REQUIRED_CONTENT_PATHS.map((logicalPath) => {
    const bytes = Buffer.from("{}\n", "utf8");
    const absolutePath = path.join(root, ...logicalPath.split("/"));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);
    return { path: logicalPath, sha256: sha256(bytes), bytes: bytes.length };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    gameId: "cli-fixture",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json",
    parentRevision: "",
    publishedRevision: "",
    files: records,
    rootHash: sha256(Buffer.from(rootHashInput(records), "utf8"))
  };
  fs.writeFileSync(path.join(root, "content-bundle.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("pop-party CLI", () => {
  it("validates a complete local bundle", async () => {
    const messages = [];
    const output = { log: (message) => messages.push(message), error: (message) => messages.push(message) };
    expect(await runCli(["validate", validBundle()], { output })).toBe(0);
    expect(messages).toContain("Content bundle valid: cli-fixture");
  });

  it("fails closed for an incomplete bundle and unknown commands", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-cli-invalid-"));
    temporaryRoots.push(root);
    const errors = [];
    const output = { log() {}, error: (message) => errors.push(message) };
    expect(await runCli(["validate", root], { output })).toBe(1);
    expect(await runCli(["build"], { cwd: root, output, engineVersion: "1.0.0" })).toBe(1);
    expect(await runCli(["publish"], { output })).toBe(1);
    expect(errors.some((message) => message.includes("Content bundle invalid"))).toBe(true);
    expect(errors.some((message) => message.includes("Game build invalid"))).toBe(true);
    expect(errors.some((message) => message.includes("Unknown pop-party command"))).toBe(true);
  });

  it("starts production and development services through the validated application boundary", async () => {
    const calls = [];
    const messages = [];
    const output = { log: (message) => messages.push(message), error: (message) => messages.push(message) };
    const startGameApplication = async (options) => {
      calls.push(options);
      return {
        runtime: { stop() {} },
        startup: { localUrl: "http://localhost:4321", lanUrls: ["http://10.0.0.2:4321"] }
      };
    };
    const startDevelopmentApplication = async (options) => ({
      ...(await startGameApplication(options)),
      development: {
        contentRoot: "/tmp/fixture/.pop-party/content",
        revision: "development-1",
        seeded: true
      }
    });

    expect(await runCli(["start", "custom.config.js", "--host", "127.0.0.1", "--port=4321"], {
      cwd: "/tmp/fixture",
      engineVersion: "1.0.0",
      installSignalHandlers: false,
      output,
      startGameApplication,
      startDevelopmentApplication
    })).toBe(0);
    expect(await runCli(["dev", "--port", "0"], {
      cwd: "/tmp/fixture",
      engineVersion: "1.0.0",
      env: {},
      installSignalHandlers: false,
      output,
      startGameApplication,
      startDevelopmentApplication
    })).toBe(0);

    expect(calls).toEqual([
      expect.objectContaining({ configPath: "custom.config.js", host: "127.0.0.1", port: 4321 }),
      expect.objectContaining({ configPath: "game.config.js", host: "0.0.0.0", port: 0 })
    ]);
    expect(messages).toContain("Game service ready: http://localhost:4321");
    expect(messages).toContain("LAN: http://10.0.0.2:4321");
    expect(messages).toContain("Development content: .pop-party/content (seeded)");
    expect(messages).toContain("Development revision: development-1");
  });

  it("rejects invalid service arguments before opening a port", async () => {
    expect(() => serviceArguments(["--port", "abc"], {})).toThrow(/port must be an integer/i);
    expect(() => serviceArguments(["--host"], {})).toThrow(/requires a value/i);
    expect(() => serviceArguments(["--unknown"], {})).toThrow(/Unknown service option/);
    expect(() => serviceArguments(["one.js", "two.js"], {})).toThrow(/Unexpected service argument/);

    const messages = [];
    expect(await runCli(["start", "--port", "abc"], {
      installSignalHandlers: false,
      output: { log() {}, error: (message) => messages.push(message) }
    })).toBe(1);
    expect(messages[0]).toMatch(/Game service invalid/);
  });

  it("previews migrations and writes only when an output directory is explicit", async () => {
    const calls = [];
    const messages = [];
    const output = { log: (message) => messages.push(message), error: (message) => messages.push(message) };
    const createGameMigration = async (options) => {
      calls.push(options);
      return {
        outputRoot: options.outputDirectory ? "/tmp/fixture/migrated" : null,
        preview: {
          changedPaths: ["constants.json"],
          sourceLevel: 0,
          sourceRevision: "source-1",
          targetLevel: 1,
          targetRevision: "target-1"
        }
      };
    };

    expect(await runCli(["migrate", "custom.config.js", "--to-level", "1"], {
      createGameMigration,
      cwd: "/tmp/fixture",
      engineVersion: "1.0.0",
      output
    })).toBe(0);
    expect(await runCli(["migrate", "--to-level=1", "--output", "migrated"], {
      createGameMigration,
      cwd: "/tmp/fixture",
      engineVersion: "1.0.0",
      output
    })).toBe(0);
    expect(calls).toEqual([
      expect.objectContaining({ configPath: "custom.config.js", outputDirectory: undefined, targetLevel: 1 }),
      expect.objectContaining({ configPath: "game.config.js", outputDirectory: "migrated", targetLevel: 1 })
    ]);
    expect(messages).toContain("Migration preview valid: level 0 -> 1");
    expect(messages).toContain("Changed paths: constants.json");
    expect(messages).toContain("Migration output: migrated");
  });

  it("rejects unsafe migration arguments before loading content", () => {
    expect(() => migrationArguments(["--to-level", "-1"])).toThrow(/non-negative integer/);
    expect(() => migrationArguments(["--output"])).toThrow(/requires a value/);
    expect(() => migrationArguments(["--unknown"])).toThrow(/Unknown migration option/);
    expect(() => migrationArguments(["one.js", "two.js"])).toThrow(/Unexpected migration argument/);
  });
});
