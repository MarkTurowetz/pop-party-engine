"use strict";

const crypto = require("crypto");
const { publicReleaseTuple } = require("./room-content-pin-runtime");

const PLAYER_ENDPOINTS = new Set([
  "/api/heartbeat", "/api/avatar", "/api/leave", "/api/start", "/api/cancel-start",
  "/api/controller-choice", "/api/controller-microphone-access", "/api/controller-text-submit",
  "/api/game-plugin-input", "/api/game-plugin-controller-interaction"
]);
const STAGE_ENDPOINTS = new Set([
  "/api/advance-presentation", "/api/complete-action", "/api/pause", "/api/action-effect", "/api/quit-to-lobby"
]);

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function secureHashMatches(token, expectedHash) {
  const actual = Buffer.from(tokenHash(token));
  const expected = Buffer.from(String(expectedHash || ""));
  return actual.length === expected.length && expected.length > 0 && crypto.timingSafeEqual(actual, expected);
}

function createRuntimeCapabilityRuntime(options = {}) {
  const mode = String(options.mode || "legacy").toLowerCase();
  if (!["legacy", "required"].includes(mode)) throw new Error(`Unsupported runtime capability mode: ${mode}`);
  const getExistingRoom = options.getExistingRoom;
  const getRoom = options.getRoom;
  const normalizePlayerId = options.normalizePlayerId;
  const normalizeStageCode = options.normalizeStageCode;
  const readJson = options.readJson;
  const sendJson = options.sendJson;
  const pinNewRoom = options.pinNewRoom;
  const pinPreviewRoom = options.pinPreviewRoom;
  const deleteRoom = typeof options.deleteRoom === "function" ? options.deleteRoom : () => {};
  const eventTicketMaxAgeMs = Number(options.eventTicketMaxAgeMs || 30_000);
  const createWindowsByAddress = new Map();
  if (mode === "required" && typeof pinNewRoom !== "function") {
    throw new Error("Required runtime capabilities need an immutable room content pinner");
  }

  function issueToken() {
    return crypto.randomBytes(32).toString("base64url");
  }

  function stageHeader(req) {
    return String(req.headers["x-stage-capability"] || "");
  }

  function playerHeader(req) {
    return String(req.headers["x-player-capability"] || "");
  }

  function ensureRoomCapabilityState(room) {
    if (!room.playerCapabilityHashes) room.playerCapabilityHashes = new Map();
    if (!room.stageEventTicketHashes) room.stageEventTicketHashes = new Map();
  }

  function issueStageCapability(room) {
    ensureRoomCapabilityState(room);
    const token = issueToken();
    room.stageCapabilityHash = tokenHash(token);
    return token;
  }

  function issuePlayerCapability(room, playerId) {
    ensureRoomCapabilityState(room);
    const token = issueToken();
    room.playerCapabilityHashes.set(playerId, tokenHash(token));
    return token;
  }

  function verifyStage(req, room) {
    return mode === "legacy" || Boolean(room && secureHashMatches(stageHeader(req), room.stageCapabilityHash));
  }

  function verifyPlayer(req, room, playerId) {
    ensureRoomCapabilityState(room || {});
    return mode === "legacy" || Boolean(room && playerId && secureHashMatches(playerHeader(req), room.playerCapabilityHashes.get(playerId)));
  }

  function deny(res, code, error, status = 401) {
    sendJson(res, status, { ok: false, error, errorCode: code });
    return false;
  }

  function headersIdentity(req) {
    return {
      stageCode: normalizeStageCode(req.headers["x-stage-code"]),
      playerId: normalizePlayerId(req.headers["x-player-id"])
    };
  }

  function consumeEventTicket(room, ticket) {
    ensureRoomCapabilityState(room);
    const hash = tokenHash(ticket);
    const expiresAt = room.stageEventTicketHashes.get(hash);
    room.stageEventTicketHashes.delete(hash);
    return Number(expiresAt || 0) > Date.now();
  }

  function authorizeRequest(req, res, url) {
    if (mode !== "required") return true;
    const stageEventMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/events$/i);
    if (req.method === "GET" && stageEventMatch) {
      const room = getExistingRoom(normalizeStageCode(stageEventMatch[1]));
      return room && consumeEventTicket(room, url.searchParams.get("ticket"))
        ? true
        : deny(res, "STAGE_CAPABILITY_REQUIRED", "Stage event authorization is missing or expired");
    }
    const stageContentMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/content\//i);
    if (req.method === "GET" && stageContentMatch) {
      const stageCode = normalizeStageCode(stageContentMatch[1]);
      const room = getExistingRoom(stageCode);
      const playerId = normalizePlayerId(req.headers["x-player-id"]);
      return (verifyStage(req, room) || verifyPlayer(req, room, playerId))
        ? true
        : deny(res, playerId ? "PLAYER_CAPABILITY_REQUIRED" : "STAGE_CAPABILITY_REQUIRED", "Room content authorization is required");
    }
    const stageRouteMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/(?:lobby|test-config|event-ticket)$/i);
    if (stageRouteMatch) {
      const stageCode = normalizeStageCode(stageRouteMatch[1]);
      const room = getExistingRoom(stageCode);
      return verifyStage(req, room) ? true : deny(res, "STAGE_CAPABILITY_REQUIRED", "Stage authorization is required");
    }
    if (STAGE_ENDPOINTS.has(url.pathname)) {
      const { stageCode } = headersIdentity(req);
      return verifyStage(req, getExistingRoom(stageCode)) ? true : deny(res, "STAGE_CAPABILITY_REQUIRED", "Stage authorization is required");
    }
    if (PLAYER_ENDPOINTS.has(url.pathname)) {
      const { stageCode, playerId } = headersIdentity(req);
      return verifyPlayer(req, getExistingRoom(stageCode), playerId) ? true : deny(res, "PLAYER_CAPABILITY_REQUIRED", "Player authorization is required");
    }
    if (url.pathname === "/api/input-event") {
      const { stageCode, playerId } = headersIdentity(req);
      const room = getExistingRoom(stageCode);
      return (playerId ? verifyPlayer(req, room, playerId) : verifyStage(req, room))
        ? true
        : deny(res, playerId ? "PLAYER_CAPABILITY_REQUIRED" : "STAGE_CAPABILITY_REQUIRED", "Runtime authorization is required");
    }
    return true;
  }

  function rateLimitRoomCreation(req) {
    const address = String(req.socket?.remoteAddress || "unknown");
    const now = Date.now();
    const recent = (createWindowsByAddress.get(address) || []).filter((time) => now - time < 60_000);
    if (recent.length >= 10) return false;
    recent.push(now);
    createWindowsByAddress.set(address, recent);
    return true;
  }

  async function createRoom(req, res, { preview = false } = {}) {
    if (!rateLimitRoomCreation(req)) return deny(res, "ROOM_CREATE_RATE_LIMIT", "Too many room creation attempts", 429);
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }
    const stageCode = normalizeStageCode(payload.stageCode);
    if (!stageCode) {
      sendJson(res, 400, { ok: false, error: "Stage code is required" });
      return;
    }
    let room = getExistingRoom(stageCode);
    let capability = stageHeader(req);
    if (preview && room && (
      room.releasePin?.contentSource !== "draft-preview"
      || (mode === "required" && !verifyStage(req, room))
    )) {
      deny(res, "ROOM_ALREADY_EXISTS", "Draft preview requires a new room code or its existing stage capability", 409);
      return;
    }
    if (room && mode === "required" && !verifyStage(req, room)) {
      deny(res, "ROOM_ALREADY_EXISTS", "That room already exists in another stage session", 409);
      return;
    }
    if (!room) {
      room = getRoom(stageCode);
      const pinner = preview ? pinPreviewRoom : pinNewRoom;
      if (typeof pinner !== "function") {
        deleteRoom(stageCode);
        sendJson(res, 409, {
          ok: false,
          error: preview ? "Draft preview rooms are not enabled" : "Room content pinning is not enabled",
          errorCode: preview ? "DRAFT_PREVIEW_DISABLED" : "ROOM_CONTENT_PIN_DISABLED"
        });
        return;
      }
      if (typeof pinner === "function") {
        try {
          await pinner(room);
        } catch (error) {
          deleteRoom(stageCode);
          sendJson(res, 503, {
            ok: false,
            error: preview
              ? "Room could not pin the latest complete authoring draft"
              : "Room could not pin the active content release",
            errorCode: error.code || "ROOM_CONTENT_PIN_FAILED"
          });
          return;
        }
      }
    }
    if (!capability || !verifyStage(req, room)) capability = issueStageCapability(room);
    sendJson(res, 200, { ok: true, stageCode, stageCapability: capability, release: publicReleaseTuple(room.releasePin) });
  }

  function handleCreateRoom(req, res) {
    return createRoom(req, res);
  }

  function handleCreatePreviewRoom(req, res) {
    return createRoom(req, res, { preview: true });
  }

  function handleCreateEventTicket(req, res, stageCode) {
    const room = getExistingRoom(stageCode);
    if (!room || !verifyStage(req, room)) {
      deny(res, "STAGE_CAPABILITY_REQUIRED", "Stage authorization is required");
      return;
    }
    ensureRoomCapabilityState(room);
    const ticket = issueToken();
    room.stageEventTicketHashes.set(tokenHash(ticket), Date.now() + eventTicketMaxAgeMs);
    sendJson(res, 200, { ok: true, ticket, expiresInMs: eventTicketMaxAgeMs });
  }

  function newPlayerIdentity(room) {
    const playerId = `p-${crypto.randomBytes(12).toString("base64url")}`;
    return { playerId, playerCapability: issuePlayerCapability(room, playerId) };
  }

  function reconnectCapability(req, room, playerId) {
    return verifyPlayer(req, room, playerId) ? playerHeader(req) : "";
  }

  function removePlayerCapability(room, playerId) {
    room?.playerCapabilityHashes?.delete(playerId);
  }

  function publicStatus() {
    return Object.freeze({ mode, protected: mode === "required" });
  }

  return Object.freeze({
    authorizeRequest,
    handleCreateEventTicket,
    handleCreatePreviewRoom,
    handleCreateRoom,
    issuePlayerCapability,
    newPlayerIdentity,
    publicStatus,
    reconnectCapability,
    removePlayerCapability,
    verifyPlayer,
    verifyStage
  });
}

module.exports = { PLAYER_ENDPOINTS, STAGE_ENDPOINTS, createRuntimeCapabilityRuntime, secureHashMatches, tokenHash };
