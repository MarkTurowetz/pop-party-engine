import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createAuthoringSessionContentRuntime } = require("./authoring-session-content-runtime");
const { buildManifest, createContentSnapshot } = require("./content-snapshot-runtime");
const { createReleaseRecord } = require("./revisioned-content-store-runtime");

const temporaryRoots = [];

function fixture() {
  const authoringRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-authoring-session-"));
  temporaryRoots.push(authoringRoot);
  const baseFiles = new Map([
    ["flow.json", Buffer.from("{}\n")],
    ["constants.json", Buffer.from("{}\n")],
    ["layouts/stage.json", Buffer.from("{}\n")],
    ["layouts/controller.json", Buffer.from("{}\n")],
    ["audio/host-audios.json", Buffer.from("{}\n")],
    ["art/manifest.json", Buffer.from('{"assets":[]}\n')],
    ["prompts/prompts.json", Buffer.from('{"prompts":[]}\n')],
    ["semantic-roles.json", Buffer.from("{}\n")],
    ["game-data/runtime.json", Buffer.from("{}\n")]
  ]);
  const manifest = buildManifest({
    schemaVersion: 1,
    gameId: "fixture-game",
    engineContentSchemaVersion: "1.1.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: ""
  }, baseFiles);
  const baseSnapshot = createContentSnapshot({ manifest, files: baseFiles });
  const baseRelease = createReleaseRecord({
    gameId: "fixture-game",
    gameBuild: "0.1.0",
    engineVersion: "1.1.0",
    pluginVersion: "0.1.0",
    contentRevision: baseSnapshot.revision
  });
  const sources = {
    artManifest: { assets: [], compositions: {} },
    constants: { gameTitle: "Draft One" },
    controllerLayouts: { states: [{ id: "lobby" }] },
    flow: { states: [{ id: "lobby", entryTargetActionId: "show", actions: [{ id: "show" }] }] },
    hostAudios: { hostAudios: [] },
    stageLayouts: { states: [{ id: "lobby" }] }
  };
  const loader = (key) => vi.fn(async () => structuredClone(sources[key]));
  const runtime = createAuthoringSessionContentRuntime({
    authoringRoot,
    baseContentStore: {
      getActiveRelease: vi.fn(async () => baseRelease),
      loadPublishedRevision: vi.fn(async () => baseSnapshot)
    },
    gameId: "fixture-game",
    gameBuild: "0.1.0",
    engineVersion: "1.1.0",
    pluginVersion: "0.1.0",
    loadArtManifest: loader("artManifest"),
    loadConstants: loader("constants"),
    loadControllerLayouts: loader("controllerLayouts"),
    loadFlow: loader("flow"),
    loadHostAudios: loader("hostAudios"),
    loadStageLayouts: loader("stageLayouts"),
    materializeGameData: (snapshot) => ({
      defaultGameConstants: snapshot.readJson("constants.json"),
      defaultGameFlow: snapshot.readJson("flow.json")
    }),
    validateRelease: vi.fn(async () => ({ ok: true }))
  });
  return { runtime, sources };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("latest-saved authoring session content", () => {
  it("keeps a running room pinned until the next lobby session boundary", async () => {
    const { runtime, sources } = fixture();
    await runtime.refresh();
    const room = {};
    await runtime.pinNewRoom(room);
    const firstRevision = room.releasePin.contentRevision;
    expect(room.gameData.defaultGameConstants.gameTitle).toBe("Draft One");

    sources.constants.gameTitle = "Draft Two";
    await runtime.refresh();

    expect(room.releasePin.contentRevision).toBe(firstRevision);
    expect(room.gameData.defaultGameConstants.gameTitle).toBe("Draft One");

    runtime.prepareLobbySession(room);
    expect(room.releasePin.contentRevision).not.toBe(firstRevision);
    expect(room.gameData.defaultGameConstants.gameTitle).toBe("Draft Two");
  });

  it("fails closed after the latest saved authoring data becomes invalid", async () => {
    const { runtime, sources } = fixture();
    await runtime.refresh();
    const room = {};
    await runtime.pinNewRoom(room);

    sources.artManifest.assets = [{
      id: "missing-art",
      blobPath: "blobs/missing.png",
      mimeType: "image/png"
    }];
    await expect(runtime.refresh()).rejects.toThrow(/missing blobs\/missing\.png/);
    expect(() => runtime.prepareLobbySession(room)).toThrow(/Latest saved authoring content is unavailable/);
  });
});
