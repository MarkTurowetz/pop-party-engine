import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createRoomBroadcastRuntime,
  createSurfaceProjectionRuntime,
  semanticProjectionFingerprint
} = require("../packages/engine/src/server");

function room() {
  return {
    revision: 0,
    stageClients: new Set(),
    stagePublicationPending: false,
    surfaceProjections: {
      stage: { fingerprint: "", revision: 0, publishedRevision: 0 },
      controllers: new Map()
    }
  };
}

describe("surface projections", () => {
  it("ignores transport-only fields while detecting semantic Stage changes", () => {
    const first = semanticProjectionFingerprint({ revision: 1, serverNow: 10, phase: "round", players: [] });
    const heartbeat = semanticProjectionFingerprint({ revision: 2, serverNow: 20, phase: "round", players: [] });
    const changed = semanticProjectionFingerprint({ revision: 3, serverNow: 30, phase: "round", players: [{ id: "one" }] });

    expect(heartbeat).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("keeps independent semantic revisions for Stage and each private Controller", () => {
    const runtime = createSurfaceProjectionRuntime();
    const target = room();
    const base = { revision: 1, serverNow: 10, phase: "round", players: [] };

    const stage = runtime.project(target, "", base);
    const one = runtime.project(target, "one", { ...base, gamePlugin: { input: { submitted: false } } });
    const two = runtime.project(target, "two", { ...base, gamePlugin: { input: { submitted: false } } });
    const submitted = runtime.project(target, "one", {
      ...base,
      revision: 2,
      serverNow: 20,
      gamePlugin: { input: { submitted: true } }
    });
    const unchangedTwo = runtime.project(target, "two", {
      ...base,
      revision: 2,
      serverNow: 20,
      gamePlugin: { input: { submitted: false } }
    });
    const unchangedStage = runtime.project(target, "", { ...base, revision: 2, serverNow: 20 });

    expect(stage).toMatchObject({ surface: "stage", surfaceRevision: 1 });
    expect(one).toMatchObject({ surface: "controller", surfaceRevision: 1 });
    expect(two).toMatchObject({ surface: "controller", surfaceRevision: 1 });
    expect(submitted.surfaceRevision).toBe(2);
    expect(unchangedTwo.surfaceRevision).toBe(1);
    expect(unchangedStage.surfaceRevision).toBe(1);
  });

  it("commits every authoritative room revision but publishes only changed Stage projections", () => {
    const projection = createSurfaceProjectionRuntime();
    const target = room();
    const writes = [];
    const client = { write: (value) => writes.push(value) };
    target.stageClients.add(client);
    let publicCount = 0;
    let controllerSubmitted = false;
    const lobbyPayload = (currentRoom) => projection.project(currentRoom, "", {
      type: "lobby",
      revision: currentRoom.revision,
      serverNow: currentRoom.revision * 10,
      phase: "round",
      publicCount
    });
    const queued = [];
    const broadcast = createRoomBroadcastRuntime({
      getLobbyPayload: () => lobbyPayload,
      markStagePublished: projection.markStagePublished,
      queueMicrotaskImpl: (callback) => queued.push(callback),
      shouldPublishStage: projection.shouldPublishStage
    });

    const initial = lobbyPayload(target);
    projection.markStagePublished(target, initial);
    controllerSubmitted = true;
    broadcast.broadcastLobby(target);
    expect(target.revision).toBe(1);
    expect(queued).toHaveLength(1);
    queued.shift()();
    expect(writes).toHaveLength(0);
    expect(controllerSubmitted).toBe(true);

    publicCount = 1;
    broadcast.broadcastLobby(target);
    broadcast.broadcastLobby(target);
    expect(target.revision).toBe(3);
    expect(queued).toHaveLength(1);
    queued.shift()();
    expect(writes.join("")).toContain('"publicCount":1');
    expect(writes.join("")).toContain('"surfaceRevision":2');
  });
});
