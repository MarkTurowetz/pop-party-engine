import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { REQUIRED_CONTENT_PATHS, rootHashInput } = require("../shared/content-bundle-schema");
const { runCli } = require("./cli");

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
  it("validates a complete local bundle", () => {
    const messages = [];
    const output = { log: (message) => messages.push(message), error: (message) => messages.push(message) };
    expect(runCli(["validate", validBundle()], { output })).toBe(0);
    expect(messages).toContain("Content bundle valid: cli-fixture");
  });

  it("fails closed for an incomplete bundle and unknown commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-cli-invalid-"));
    temporaryRoots.push(root);
    const errors = [];
    const output = { log() {}, error: (message) => errors.push(message) };
    expect(runCli(["validate", root], { output })).toBe(1);
    expect(runCli(["publish"], { output })).toBe(1);
    expect(errors.some((message) => message.includes("Content bundle invalid"))).toBe(true);
    expect(errors.some((message) => message.includes("Unknown pop-party command"))).toBe(true);
  });
});
