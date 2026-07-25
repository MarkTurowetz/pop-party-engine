import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRuntimeCapabilityRuntime } = require("./runtime-capability-runtime");

function request({ method = "POST", headers = {}, remoteAddress = "127.0.0.1" } = {}) {
  return { method, headers, socket: { remoteAddress } };
}

function createHarness({
  mode = "required",
  payload = {},
  eventTicketMaxAgeMs,
  pinNewRoom = vi.fn(async () => {}),
  pinPreviewRoom = vi.fn(async () => {})
} = {}) {
  const rooms = new Map();
  const response = {};
  const sendJson = vi.fn((_res, status, body) => Object.assign(response, { status, body }));
  const getExistingRoom = (stageCode) => rooms.get(stageCode) || null;
  const getRoom = (stageCode) => {
    let room = rooms.get(stageCode);
    if (!room) {
      room = { stageCode, players: new Map() };
      rooms.set(stageCode, room);
    }
    return room;
  };
  const runtime = createRuntimeCapabilityRuntime({
    mode,
    getExistingRoom,
    getRoom,
    normalizePlayerId: (value) => String(value || ""),
    normalizeStageCode: (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
    readJson: async () => payload,
    sendJson,
    pinNewRoom,
    pinPreviewRoom,
    deleteRoom: (stageCode) => rooms.delete(stageCode),
    eventTicketMaxAgeMs
  });
  return { getRoom, response, rooms, runtime, sendJson };
}

describe("runtime capability authorization", () => {
  it("creates a room explicitly and rejects a second stage without its capability", async () => {
    const harness = createHarness({ payload: { stageCode: "abcd" } });
    await harness.runtime.handleCreateRoom(request(), {});

    expect(harness.response).toMatchObject({
      status: 200,
      body: { ok: true, stageCode: "ABCD" }
    });
    const stageCapability = harness.response.body.stageCapability;
    expect(stageCapability).toBeTruthy();

    await harness.runtime.handleCreateRoom(request(), {});
    expect(harness.response).toMatchObject({ status: 409, body: { errorCode: "ROOM_ALREADY_EXISTS" } });

    await harness.runtime.handleCreateRoom(request({ headers: { "x-stage-capability": stageCapability } }), {});
    expect(harness.response).toMatchObject({ status: 200, body: { stageCapability } });
  });

  it("requires the stage capability for stage mutations", async () => {
    const harness = createHarness({ payload: { stageCode: "ABCD" } });
    await harness.runtime.handleCreateRoom(request(), {});
    const stageCapability = harness.response.body.stageCapability;
    const url = new URL("http://test/api/pause");

    expect(harness.runtime.authorizeRequest(request({ headers: { "x-stage-code": "ABCD" } }), {}, url)).toBe(false);
    expect(harness.response).toMatchObject({ status: 401, body: { errorCode: "STAGE_CAPABILITY_REQUIRED" } });
    expect(harness.runtime.authorizeRequest(request({ headers: {
      "x-stage-code": "ABCD",
      "x-stage-capability": stageCapability
    } }), {}, url)).toBe(true);
  });

  it("scopes player capabilities to one player and room", () => {
    const harness = createHarness();
    const room = harness.getRoom("ABCD");
    const first = harness.runtime.newPlayerIdentity(room);
    const second = harness.runtime.newPlayerIdentity(room);
    const firstRequest = request({ headers: {
      "x-stage-code": "ABCD",
      "x-player-id": first.playerId,
      "x-player-capability": first.playerCapability
    } });

    expect(harness.runtime.authorizeRequest(firstRequest, {}, new URL("http://test/api/heartbeat"))).toBe(true);
    const wrongPlayerRequest = request({ headers: {
      "x-stage-code": "ABCD",
      "x-player-id": second.playerId,
      "x-player-capability": first.playerCapability
    } });
    expect(harness.runtime.authorizeRequest(wrongPlayerRequest, {}, new URL("http://test/api/heartbeat"))).toBe(false);
    expect(harness.response.body.errorCode).toBe("PLAYER_CAPABILITY_REQUIRED");
  });

  it("authorizes pinned room content for only that room's stage or player", async () => {
    const harness = createHarness({ payload: { stageCode: "ABCD" } });
    await harness.runtime.handleCreateRoom(request(), {});
    const room = harness.getRoom("ABCD");
    const stageCapability = harness.response.body.stageCapability;
    const player = harness.runtime.newPlayerIdentity(room);
    const url = new URL("http://test/api/stage/ABCD/content/art-assets");

    expect(harness.runtime.authorizeRequest(request({ method: "GET", headers: {
      "x-stage-capability": stageCapability
    } }), {}, url)).toBe(true);
    expect(harness.runtime.authorizeRequest(request({ method: "GET", headers: {
      "x-player-id": player.playerId,
      "x-player-capability": player.playerCapability
    } }), {}, url)).toBe(true);
    expect(harness.runtime.authorizeRequest(request({ method: "GET" }), {}, url)).toBe(false);
  });

  it("consumes stage event tickets once", async () => {
    const harness = createHarness({ payload: { stageCode: "ABCD" } });
    await harness.runtime.handleCreateRoom(request(), {});
    const stageCapability = harness.response.body.stageCapability;
    harness.runtime.handleCreateEventTicket(
      request({ headers: { "x-stage-capability": stageCapability } }),
      {},
      "ABCD"
    );
    const ticket = harness.response.body.ticket;
    const eventUrl = new URL(`http://test/api/stage/ABCD/events?ticket=${ticket}`);

    expect(harness.runtime.authorizeRequest(request({ method: "GET" }), {}, eventUrl)).toBe(true);
    expect(harness.runtime.authorizeRequest(request({ method: "GET" }), {}, eventUrl)).toBe(false);
    expect(harness.response.body.errorCode).toBe("STAGE_CAPABILITY_REQUIRED");
  });

  it("keeps legacy mode compatible with existing uncredentialed routes", () => {
    const harness = createHarness({ mode: "legacy" });
    const url = new URL("http://test/api/controller-text-submit");
    expect(harness.runtime.authorizeRequest(request(), {}, url)).toBe(true);
  });

  it("fails closed and removes a room when its content revision cannot pin", async () => {
    const harness = createHarness({
      payload: { stageCode: "ABCD" },
      pinNewRoom: vi.fn(async () => { throw Object.assign(new Error("invalid"), { code: "ACTIVE_RELEASE_INCOMPATIBLE" }); })
    });
    await harness.runtime.handleCreateRoom(request(), {});
    expect(harness.response).toMatchObject({ status: 503, body: { errorCode: "ACTIVE_RELEASE_INCOMPATIBLE" } });
    expect(harness.rooms.has("ABCD")).toBe(false);
  });

  it("creates draft preview rooms only through the preview pinner and refuses existing room codes", async () => {
    const pinNewRoom = vi.fn(async () => {});
    const pinPreviewRoom = vi.fn(async (room) => {
      room.releasePin = { contentRevision: "draft-1", contentSource: "draft-preview" };
    });
    const harness = createHarness({
      payload: { stageCode: "DRAFT" },
      pinNewRoom,
      pinPreviewRoom
    });

    await harness.runtime.handleCreatePreviewRoom(request(), {});
    expect(pinPreviewRoom).toHaveBeenCalledTimes(1);
    expect(pinNewRoom).not.toHaveBeenCalled();
    expect(harness.response.body.release).toMatchObject({
      contentRevision: "draft-1",
      contentSource: "draft-preview"
    });

    const capability = harness.response.body.stageCapability;
    await harness.runtime.handleCreatePreviewRoom(request(), {});
    expect(harness.response).toMatchObject({ status: 409, body: { errorCode: "ROOM_ALREADY_EXISTS" } });
    await harness.runtime.handleCreatePreviewRoom(request({ headers: { "x-stage-capability": capability } }), {});
    expect(harness.response).toMatchObject({ status: 200, body: { stageCapability: capability } });
  });

  it("refuses to construct strict mode without a content pinner", () => {
    expect(() => createRuntimeCapabilityRuntime({
      mode: "required",
      getExistingRoom: () => null,
      getRoom: () => ({}),
      normalizePlayerId: String,
      normalizeStageCode: String,
      readJson: async () => ({}),
      sendJson: vi.fn()
    })).toThrow(/content pinner/);
  });
});
