"use strict";

function createLivePrototypeRoomContentRuntime(options = {}) {
  const materializeGameData = options.materializeGameData;
  const validateRelease = options.validateRelease;
  const enterLobbyPhase = options.enterLobbyPhase;
  const broadcastLobby = options.broadcastLobby;
  const releaseCoordinates = Object.freeze({ ...(options.release || {}) });
  const pendingPins = new WeakMap();

  if (typeof materializeGameData !== "function") {
    throw new Error("Live prototype room content requires a game-data materializer");
  }
  if (typeof validateRelease !== "function") {
    throw new Error("Live prototype room content requires a release validator");
  }
  if (typeof enterLobbyPhase !== "function") {
    throw new Error("Live prototype room content requires a lobby transition");
  }
  if (typeof broadcastLobby !== "function") {
    throw new Error("Live prototype room content requires a lobby broadcaster");
  }

  function applyPin(room, pin) {
    room.releasePin = pin.releasePin;
    room.contentSnapshot = pin.snapshot;
    room.gameData = pin.gameData;
  }

  async function preparePin(snapshot, release, reset) {
    const gameData = materializeGameData(snapshot);
    const completeRelease = Object.freeze({
      ...release,
      ...releaseCoordinates
    });
    const validation = await validateRelease({
      gameData,
      release: completeRelease,
      snapshot
    });
    if (validation?.ok === false) {
      const error = new Error("The working bundle is incompatible with this game build");
      error.code = "WORKING_BUNDLE_INCOMPATIBLE";
      error.diagnostics = validation.diagnostics || [];
      throw error;
    }
    return Object.freeze({
      releasePin: Object.freeze({
        ...completeRelease,
        contentSource: reset
          ? "live-prototype"
          : String(completeRelease.contentSource || "published-release")
      }),
      snapshot,
      gameData
    });
  }

  async function installRoomSnapshot(
    room,
    snapshot,
    release,
    { reset = false, deferUntilNextSession = false, hotReload = false } = {}
  ) {
    const requestedRevision = String(release?.contentRevision || snapshot?.revision || "");
    const installedRevision = String(
      room?.releasePin?.contentRevision || room?.contentSnapshot?.revision || ""
    );

    // Re-establishing an editor session may republish the exact snapshot that
    // an existing room already owns. Treat that as lease bookkeeping, not a
    // gameplay command: do not restart Lobby or replay Start Moment.
    if (requestedRevision && requestedRevision === installedRevision) {
      pendingPins.delete(room);
      return Object.freeze({ changed: false, deferred: false });
    }

    const pin = await preparePin(snapshot, release, reset);

    if (deferUntilNextSession) {
      pendingPins.set(room, pin);
      return Object.freeze({ changed: false, deferred: true });
    }

    // Gameplay-affecting authoring remains session-boundary data. Validated
    // presentation-only Art/Layout snapshots are different: live-prototype is
    // an authoring surface, so the existing room must resolve the same saved
    // composition that the Tools and the next room resolve without restarting
    // Flow or replaying the active moment.
    if (reset && String(room?.phase || "lobby") !== "lobby") {
      pendingPins.set(room, pin);
      return Object.freeze({ changed: false, deferred: true });
    }

    pendingPins.delete(room);
    applyPin(room, pin);
    if (hotReload) {
      broadcastLobby(room);
      return Object.freeze({ changed: true, deferred: false, hotReloaded: true });
    }
    if (reset) {
      enterLobbyPhase(room);
      broadcastLobby(room);
    }
    return Object.freeze({ changed: true, deferred: false });
  }

  function prepareLobbySession(room) {
    const pin = pendingPins.get(room);
    if (!pin) return false;
    pendingPins.delete(room);
    applyPin(room, pin);
    return true;
  }

  return Object.freeze({
    installRoomSnapshot,
    prepareLobbySession
  });
}

module.exports = Object.freeze({
  createLivePrototypeRoomContentRuntime
});
