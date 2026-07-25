import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/engine/src/server");
const { createBundleGameData } = require(path.join(engineRoot, "content-game-data-runtime"));
const { createDraftPreviewRoomRuntime } = require(path.join(engineRoot, "draft-preview-room-runtime"));
const { createLocalContentBundleProvider } = require(path.join(engineRoot, "local-content-bundle-provider"));
const { createRevisionedContentStoreRuntime } = require(path.join(engineRoot, "revisioned-content-store-runtime"));
const { createRevisionedToolAuthoringRuntime } = require(path.join(engineRoot, "revisioned-tool-authoring-runtime"));
const { createRoomContentPinRuntime } = require(path.join(engineRoot, "room-content-pin-runtime"));

function fixture() {
  const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/reference/content");
  const provider = createLocalContentBundleProvider({
    root: contentRoot,
    gameBuild: "100",
    engineVersion: "1.1.0",
    pluginVersion: "1.0.17"
  });
  const initialSnapshot = provider.loadPublishedRevision();
  const store = createRevisionedContentStoreRuntime({
    initialSnapshot,
    initialRelease: { gameBuild: "100", engineVersion: "1.1.0", pluginVersion: "1.0.17" },
    validateSnapshot: (snapshot) => {
      try {
        createBundleGameData(snapshot);
        return { ok: true, diagnostics: [] };
      } catch (error) {
        return { ok: false, diagnostics: [{ message: error.message }] };
      }
    }
  });
  return { initialSnapshot, store };
}

describe("durable authoring contract", () => {
  it("atomically persists Tool JSON and binary assets across authoring runtime restarts", async () => {
    const { store } = fixture();
    const firstRuntime = createRevisionedToolAuthoringRuntime({ contentStore: store, scope: "default" });
    await firstRuntime.initialize();
    const before = await firstRuntime.readDraft();
    await expect(firstRuntime.writeJson("constants.json", { gameTitle: "missing revision" }, {
      idempotencyKey: "missing-revision-0001",
      operation: "constants"
    })).rejects.toMatchObject({ code: "DRAFT_REVISION_REQUIRED", actualRevision: before.revision });
    const bytes = Buffer.from("ID3 durable host audio");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const blobPath = `blobs/${sha256}.mp3`;
    const hostAudios = {
      hostAudios: [{
        id: "intro",
        name: "Intro",
        lines: [{
          id: "welcome",
          text: "Welcome",
          url: "",
          blobPath,
          sha256,
          mimeType: "audio/mpeg",
          sourceName: "welcome.mp3"
        }]
      }]
    };

    const saved = await firstRuntime.writeFiles({
      [blobPath]: bytes,
      "audio/host-audios.json": hostAudios
    }, {
      expectedRevision: before.revision,
      idempotencyKey: "host-audio-binary-0001",
      operation: "host-audio-asset"
    });
    expect(saved.snapshot.readBytes(blobPath)).toEqual(bytes);

    const restartedRuntime = createRevisionedToolAuthoringRuntime({ contentStore: store, scope: "default" });
    const restarted = await restartedRuntime.initialize();
    expect(restarted.revision).toBe(saved.revision);
    expect(restarted.snapshot.readJson("audio/host-audios.json")).toEqual(hostAudios);
    expect(restarted.snapshot.readBytes(blobPath)).toEqual(bytes);

    const revisionBeforeFailure = restarted.revision;
    await expect(restartedRuntime.writeJson("constants.json", { gameTitle: "stale" }, {
      expectedRevision: before.revision,
      idempotencyKey: "stale-save-0001",
      operation: "constants"
    })).rejects.toMatchObject({ code: "DRAFT_REVISION_CONFLICT" });
    expect((await restartedRuntime.readDraft({ refresh: true })).revision).toBe(revisionBeforeFailure);
  });

  it("pins public rooms to published releases and preview rooms to one authenticated draft snapshot", async () => {
    const { store } = fixture();
    const publicRooms = createRoomContentPinRuntime({
      contentStore: store,
      gameId: "pop-party-reference"
    });
    const previews = createDraftPreviewRoomRuntime({
      contentStore: store,
      scope: "default",
      gameId: "pop-party-reference",
      gameBuild: "100",
      engineVersion: "1.1.0",
      pluginVersion: "1.0.17"
    });
    const publicBefore = {};
    await publicRooms.pinNewRoom(publicBefore);
    const originalTitle = publicBefore.gameData.defaultGameConstants.gameTitle;

    const authoring = createRevisionedToolAuthoringRuntime({ contentStore: store });
    const draft = await authoring.initialize();
    const constants = draft.snapshot.readJson("constants.json");
    const saved = await authoring.writeJson("constants.json", {
      ...constants,
      gameTitle: "Draft Preview Title"
    }, {
      expectedRevision: draft.revision,
      idempotencyKey: "constants-save-0001",
      operation: "constants"
    });

    const previewBeforeNextSave = {};
    await previews.pinPreviewRoom(previewBeforeNextSave);
    expect(previewBeforeNextSave.releasePin.contentSource).toBe("draft-preview");
    expect(previewBeforeNextSave.gameData.defaultGameConstants.gameTitle).toBe("Draft Preview Title");

    const publicWhileDraft = {};
    await publicRooms.pinNewRoom(publicWhileDraft);
    expect(publicWhileDraft.releasePin.contentSource).toBe("published-release");
    expect(publicWhileDraft.gameData.defaultGameConstants.gameTitle).toBe(originalTitle);

    await authoring.writeJson("constants.json", {
      ...constants,
      gameTitle: "Later Draft Title"
    }, {
      expectedRevision: saved.revision,
      idempotencyKey: "constants-save-0002",
      operation: "constants"
    });
    expect(previewBeforeNextSave.gameData.defaultGameConstants.gameTitle).toBe("Draft Preview Title");
    expect(publicBefore.gameData.defaultGameConstants.gameTitle).toBe(originalTitle);

    const active = store.getActiveRelease();
    const latestDraft = store.readDraft();
    store.publishDraft({
      expectedDraftRevision: latestDraft.revision,
      expectedActiveRevision: active.releaseRevision,
      idempotencyKey: "publish-draft-0001",
      release: { gameBuild: "101", engineVersion: "1.1.0", pluginVersion: "1.0.17" }
    });
    const publicAfterPublish = {};
    await publicRooms.pinNewRoom(publicAfterPublish);
    expect(publicAfterPublish.gameData.defaultGameConstants.gameTitle).toBe("Later Draft Title");
    expect(publicBefore.gameData.defaultGameConstants.gameTitle).toBe(originalTitle);
  });
});
