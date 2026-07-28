import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBundleGameData } = require("./content-game-data-runtime");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");
const { createRevisionedContentStoreRuntime } = require("./revisioned-content-store-runtime");
const {
  createLivePrototypeWorkspaceRuntime
} = require("./live-prototype-workspace-runtime");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function fixture(options = {}) {
  const source = createLocalContentBundleProvider({
    root: path.join(projectRoot, "apps/reference/content"),
    gameBuild: "1.0.17",
    engineVersion: "1.3.0",
    pluginVersion: "1.0.17"
  });
  const initialSnapshot = source.loadPublishedRevision();
  const store = createRevisionedContentStoreRuntime({
    initialSnapshot,
    initialRelease: {
      gameBuild: "1.0.17",
      engineVersion: "1.3.0",
      pluginVersion: "1.0.17"
    },
    validateSnapshot: (snapshot) => {
      try {
        createBundleGameData(snapshot);
        return { ok: true, diagnostics: [] };
      } catch (error) {
        return { ok: false, diagnostics: [{ message: error.message }] };
      }
    }
  });
  const drafts = { binaryFiles: {} };
  const rooms = new Map([["ROOM", { installs: [] }]]);
  const installs = [];
  const workspace = createLivePrototypeWorkspaceRuntime({
    contentStore: store,
    localDraftStore: drafts,
    rooms,
    release: {
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.3.0",
      pluginVersion: "1.0.17"
    },
    acceptedArtTypes: createBundleGameData(initialSnapshot).acceptedArtTypes,
    ...options,
    installRoomSnapshot(room, snapshot, release, options) {
      room.snapshot = snapshot;
      room.release = release;
      room.gameData = createBundleGameData(snapshot);
      room.installs.push({ revision: snapshot.revision, reset: options.reset });
      installs.push({ room, snapshot, release, options });
    }
  });
  return { drafts, initialSnapshot, installs, rooms, store, workspace };
}

describe("live prototype workspace", () => {
  it("propagates valid unsaved changes, rejects invalid candidates, and discards to saved content", async () => {
    const { drafts, initialSnapshot, rooms, workspace } = fixture();
    await workspace.initialize();
    const begun = await workspace.begin();
    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Unsaved prototype title"
    };
    const changed = await workspace.applyDraft(begun.sessionId);
    expect(changed.workingRevision).not.toBe(initialSnapshot.revision);
    expect(rooms.get("ROOM").gameData.defaultGameConstants.gameTitle).toBe("Unsaved prototype title");

    drafts.constants = { gameTitle: "" };
    await expect(workspace.applyDraft(begun.sessionId)).rejects.toThrow(/constants are incomplete/i);
    expect(rooms.get("ROOM").gameData.defaultGameConstants.gameTitle).toBe("Unsaved prototype title");

    await workspace.discard(begun.sessionId);
    expect(rooms.get("ROOM").gameData.defaultGameConstants.gameTitle)
      .toBe(initialSnapshot.readJson("constants.json").gameTitle);
  });

  it("commits the exact working snapshot and reproduces it after a clean restart", async () => {
    const { drafts, store, workspace } = fixture();
    await workspace.initialize();
    const begun = await workspace.begin();
    const baseline = workspace.readWorkingSnapshot();
    drafts.constants = {
      ...baseline.readJson("constants.json"),
      gameTitle: "Saved prototype title"
    };
    await workspace.applyDraft(begun.sessionId);
    const saved = await workspace.save(begun.sessionId, "workspace-save-0001");
    expect(saved.result.contentRevision).toBe(saved.workingRevision);

    const restartedDrafts = { binaryFiles: {} };
    const restarted = createLivePrototypeWorkspaceRuntime({
      contentStore: store,
      localDraftStore: restartedDrafts,
      rooms: new Map(),
      release: {
        gameId: "pop-party-reference",
        gameBuild: "1.0.17",
        engineVersion: "1.3.0",
        pluginVersion: "1.0.17"
      },
      installRoomSnapshot() {}
    });
    await restarted.initialize();
    expect(restarted.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("Saved prototype title");
  });

  it("round-trips a complete browser checkpoint after the server workspace is discarded", async () => {
    const { drafts, initialSnapshot, workspace } = fixture();
    await workspace.initialize();
    const firstSession = await workspace.begin();
    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Browser checkpoint title"
    };
    await workspace.applyDraft(firstSession.sessionId);
    const localSave = await workspace.checkpoint(firstSession.sessionId);

    expect(localSave.checkpoint).toMatchObject({
      schemaVersion: 1,
      gameId: initialSnapshot.manifest.gameId,
      workingRevision: localSave.workingRevision,
      gitContentRevision: initialSnapshot.revision
    });
    expect(Object.keys(localSave.checkpoint.files)).toEqual(initialSnapshot.paths);

    await workspace.discard(firstSession.sessionId);
    const secondSession = await workspace.begin();
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe(initialSnapshot.readJson("constants.json").gameTitle);

    const restored = await workspace.restoreCheckpoint(
      secondSession.sessionId,
      localSave.checkpoint
    );
    expect(restored.localCheckpointRevision).toBe(localSave.workingRevision);
    expect(restored.gitSynced).toBe(false);
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("Browser checkpoint title");
  });

  it("syncs the captured local checkpoint without overwriting edits made during Git sync", async () => {
    const { drafts, initialSnapshot, store, workspace } = fixture();
    await workspace.initialize();
    const session = await workspace.begin();
    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Local save one"
    };
    await workspace.applyDraft(session.sessionId);
    const localSave = await workspace.checkpoint(session.sessionId);

    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Unsaved edit after checkpoint"
    };
    await workspace.applyDraft(session.sessionId);
    const synced = await workspace.save(
      session.sessionId,
      "workspace-browser-sync-0001",
      localSave.localCheckpointRevision
    );

    expect(store.loadPublishedRevision(synced.syncedRevision).readJson("constants.json").gameTitle)
      .toBe("Local save one");
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("Unsaved edit after checkpoint");
  });

  it("keeps staged binary audio in memory until the same atomic workspace commit", async () => {
    const { store, workspace } = fixture();
    await workspace.initialize();
    const begun = await workspace.begin();
    const baseline = workspace.readWorkingSnapshot();
    const hostAudios = baseline.readJson("audio/host-audios.json");
    const bytes = Buffer.from("prototype audio");
    const logicalPath = "blobs/prototype-audio.bin";
    hostAudios.hostAudios = [{
      id: "prototype-host",
      name: "Prototype Host",
      lines: [{
        id: "line-one",
        text: "Hello",
        blobPath: logicalPath,
        sha256: "d03b8f0f06b0541ea063fb1d672232f8263d80be7f56ef0b3dd723b1e6f8f82f",
        mimeType: "audio/wav"
      }]
    }];
    // Use the real digest so full-bundle validation covers the binary link.
    const crypto = await import("node:crypto");
    hostAudios.hostAudios[0].lines[0].sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    await workspace.stageBinary(begun.sessionId, logicalPath, bytes, (drafts) => {
      drafts.hostAudios = hostAudios;
    });
    expect(workspace.readWorkingSnapshot().readBytes(logicalPath)).toEqual(bytes);
    expect(() => store.loadPublishedRevision(workspace.state().workingRevision)).toThrow(/not published/);
    const saved = await workspace.save(begun.sessionId, "workspace-binary-0001");
    expect(store.loadPublishedRevision(saved.workingRevision).readBytes(logicalPath)).toEqual(bytes);
  });

  it("content-addresses replacement art inside the working snapshot and atomic save", async () => {
    const { drafts, store, workspace } = fixture();
    await workspace.initialize();
    const begun = await workspace.begin();
    const asset = workspace.readWorkingSnapshot().readJson("art/manifest.json").assets[0];
    drafts.artAssetReplacements = {
      [asset.id]: {
        fileName: "replacement.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      }
    };
    await workspace.applyDraft(begun.sessionId);
    const manifest = workspace.readWorkingSnapshot().readJson("art/manifest.json");
    const replaced = manifest.assets.find((candidate) => candidate.id === asset.id);
    expect(replaced.blobPath).toMatch(/^blobs\/[a-f0-9]{64}\.png$/);
    expect(workspace.readWorkingSnapshot().readBytes(replaced.blobPath).length).toBeGreaterThan(0);
    const saved = await workspace.save(begun.sessionId, "workspace-art-binary-0001");
    expect(store.loadPublishedRevision(saved.workingRevision).readBytes(replaced.blobPath).length)
      .toBeGreaterThan(0);
  });

  it("isolates workspaces that use different game-owned stores", async () => {
    const left = fixture();
    const right = fixture();
    await left.workspace.initialize();
    await right.workspace.initialize();
    const leftSession = await left.workspace.begin();
    left.drafts.constants = {
      ...left.initialSnapshot.readJson("constants.json"),
      gameTitle: "Only left"
    };
    await left.workspace.applyDraft(leftSession.sessionId);
    expect(left.workspace.readWorkingSnapshot().readJson("constants.json").gameTitle).toBe("Only left");
    expect(right.workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe(right.initialSnapshot.readJson("constants.json").gameTitle);
  });

  it("discards an abandoned workspace when its heartbeat lease expires", async () => {
    let clock = 1_000;
    const { drafts, initialSnapshot, rooms, workspace } = fixture({
      now: () => clock,
      leaseMs: 5_000
    });
    await workspace.initialize();
    const session = await workspace.begin();
    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Abandoned"
    };
    await workspace.applyDraft(session.sessionId);
    clock += 5_001;
    expect(await workspace.sweep()).toBe(true);
    expect(workspace.state().active).toBe(false);
    expect(rooms.get("ROOM").gameData.defaultGameConstants.gameTitle)
      .toBe(initialSnapshot.readJson("constants.json").gameTitle);
  });

  it("does not let a second Tools tab replace an active authoring session", async () => {
    const { drafts, initialSnapshot, workspace } = fixture();
    await workspace.initialize();
    const session = await workspace.begin();
    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Still editing"
    };
    await workspace.applyDraft(session.sessionId);

    await expect(workspace.begin()).rejects.toMatchObject({
      code: "AUTHORING_SESSION_BUSY",
      status: 409
    });
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("Still editing");

    const refreshed = await workspace.begin(session.sessionId);
    expect(refreshed.sessionId).toBe(session.sessionId);
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("Still editing");
  });

  it("restores an expired session id but requires its client drafts before saving", async () => {
    let clock = 1_000;
    const { drafts, initialSnapshot, workspace } = fixture({
      now: () => clock,
      leaseMs: 5_000
    });
    await workspace.initialize();
    const session = await workspace.begin();
    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Recover me"
    };
    await workspace.applyDraft(session.sessionId);

    clock += 5_001;
    await workspace.sweep();
    const restored = await workspace.heartbeat(session.sessionId);
    expect(restored).toMatchObject({
      active: true,
      sessionId: session.sessionId,
      recoveryRequired: true
    });
    await expect(workspace.save(session.sessionId, "premature-save"))
      .rejects.toMatchObject({ code: "AUTHORING_SESSION_RECOVERY_REQUIRED" });

    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "Recovered"
    };
    const reapplied = await workspace.applyDraft(session.sessionId);
    expect(reapplied.recoveryRequired).toBe(false);
    const saved = await workspace.save(session.sessionId, "recovered-save");
    expect(saved.saved).toBe(true);
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("Recovered");
  });

  it("preserves the first draft payload that re-establishes an inactive session", async () => {
    let clock = 1_000;
    const { drafts, initialSnapshot, workspace } = fixture({
      now: () => clock,
      leaseMs: 5_000
    });
    await workspace.initialize();
    const session = await workspace.begin();
    clock += 5_001;
    await workspace.sweep();

    drafts.constants = {
      ...initialSnapshot.readJson("constants.json"),
      gameTitle: "First recovered payload"
    };
    const recovered = await workspace.applyDraft(session.sessionId);

    expect(recovered.recoveryRequired).toBe(false);
    expect(workspace.readWorkingSnapshot().readJson("constants.json").gameTitle)
      .toBe("First recovered payload");
  });
});
