import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createDraftPreviewRoomRuntime } = require("./draft-preview-room-runtime");

describe("draft preview room runtime", () => {
  it("uses the configured runtime game-data materializer", async () => {
    const snapshot = {
      revision: "draft-content-1",
      manifest: { gameId: "fixture-game" }
    };
    const runtime = createDraftPreviewRoomRuntime({
      contentStore: {
        async initializeDraft() {},
        async readDraft() {
          return { revision: snapshot.revision, snapshot };
        }
      },
      scope: "fixture",
      gameId: "fixture-game",
      gameBuild: "1.0.0",
      engineVersion: "1.0.0",
      pluginVersion: "1.0.0",
      materializeGameData: (receivedSnapshot) => ({
        defaultControllerLayouts: {
          sourceRevision: receivedSnapshot.revision,
          states: [{ id: "lobby", elements: [{ id: "controllerlobbybuttoncontainer" }] }]
        }
      })
    });
    const room = {};

    await runtime.pinPreviewRoom(room);

    expect(room.gameData.defaultControllerLayouts).toEqual({
      sourceRevision: snapshot.revision,
      states: [{ id: "lobby", elements: [{ id: "controllerlobbybuttoncontainer" }] }]
    });
  });
});
