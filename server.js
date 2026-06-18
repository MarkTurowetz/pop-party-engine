const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");
const CONTROLLER_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 25000;

const rooms = new Map();
const avatarColors = ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff"];
const avatarShapes = ["circle", "square", "diamond", "pill", "triangle", "hex"];

function randomToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizePlayerId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

function cleanPlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8192) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getRoom(stageCode) {
  if (!rooms.has(stageCode)) {
    rooms.set(stageCode, {
      stageCode,
      stageClients: new Set(),
      players: new Map(),
      vipPlayerId: "",
      startToken: "",
      revision: 0
    });
  }
  return rooms.get(stageCode);
}

function getExistingRoom(stageCode) {
  return rooms.get(stageCode) || null;
}

function makeAvatar(playerIndex) {
  return {
    color: avatarColors[playerIndex % avatarColors.length],
    shape: avatarShapes[Math.floor(playerIndex / avatarColors.length) % avatarShapes.length]
  };
}

function activePlayers(room) {
  return Array.from(room.players.values()).filter((player) => player.active);
}

function selectVip(room) {
  const previousVipPlayerId = room.vipPlayerId;
  const active = activePlayers(room);
  if (active.length === 0) {
    room.vipPlayerId = "";
    room.startToken = "";
    return;
  }
  if (!active.some((player) => player.id === room.vipPlayerId)) {
    room.vipPlayerId = active[0].id;
  }
  if (room.vipPlayerId !== previousVipPlayerId || !room.startToken) {
    room.startToken = randomToken();
  }
}

function publicPlayer(player, room) {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    active: player.active,
    joinedAt: player.joinedAt,
    isVip: player.id === room.vipPlayerId
  };
}

function lobbyPayload(room) {
  selectVip(room);
  return {
    type: "lobby",
    stageCode: room.stageCode,
    revision: room.revision,
    vipPlayerId: room.vipPlayerId,
    startToken: room.startToken,
    players: activePlayers(room).map((player) => publicPlayer(player, room))
  };
}

function sendSse(client, event, data) {
  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastLobby(room) {
  room.revision += 1;
  const payload = lobbyPayload(room);
  for (const client of room.stageClients) {
    sendSse(client, "lobby", payload);
  }
}

function broadcastStart(room, player) {
  const payload = {
    type: "start",
    stageCode: room.stageCode,
    playerId: player.id,
    playerName: player.name,
    sentAt: Date.now()
  };
  for (const client of room.stageClients) {
    sendSse(client, "start", payload);
  }
}

function removeStageClient(stageCode, client) {
  const room = getExistingRoom(stageCode);
  if (!room) return;
  room.stageClients.delete(client);
}

function handleStageEvents(req, res, stageCode) {
  if (!stageCode) {
    sendJson(res, 400, { ok: false, error: "Missing stage code" });
    return;
  }

  const room = getRoom(stageCode);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(": connected\n\n");

  room.stageClients.add(res);
  sendSse(res, "ready", { stageCode });
  sendSse(res, "lobby", lobbyPayload(room));

  const heartbeat = setInterval(() => {
    sendSse(res, "ping", { sentAt: Date.now() });
  }, HEARTBEAT_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeStageClient(stageCode, res);
  });
}

async function handleJoin(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerName = cleanPlayerName(payload.playerName);
  let playerId = normalizePlayerId(payload.playerId) || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!stageCode || !playerName) {
    sendJson(res, 400, { ok: false, error: "Stage code and player name are required" });
    return;
  }

  const room = getRoom(stageCode);
  let player = room.players.get(playerId);
  if (player && player.active && player.name !== playerName) {
    playerId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    player = null;
  }

  if (!player) {
    player = {
      id: playerId,
      name: playerName,
      avatar: makeAvatar(room.players.size),
      active: true,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };
    room.players.set(playerId, player);
  } else {
    player.name = playerName;
    player.active = true;
    player.lastSeen = Date.now();
  }

  selectVip(room);
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
}

async function handleHeartbeat(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  if (!room || !player) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }

  const wasInactive = !player.active;
  player.active = true;
  player.lastSeen = Date.now();
  selectVip(room);
  if (wasInactive) broadcastLobby(room);
  sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
}

async function handleLeave(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  if (!room || !player) {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (player.active) {
    player.active = false;
    player.lastSeen = Date.now();
    selectVip(room);
    broadcastLobby(room);
  }
  sendJson(res, 200, { ok: true });
}

async function handleStart(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  selectVip(room || { players: new Map(), vipPlayerId: "" });

  if (!room || !player || !player.active) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }
  if (room.vipPlayerId !== playerId) {
    sendJson(res, 403, { ok: false, error: "Only the VIP can start the game" });
    return;
  }
  if (!payload.startToken || payload.startToken !== room.startToken) {
    sendJson(res, 403, { ok: false, error: "Start request is stale" });
    return;
  }

  broadcastStart(room, player);
  room.startToken = randomToken();
  broadcastLobby(room);
  sendJson(res, 200, { ok: true });
}

function handleLobby(req, res, stageCode) {
  const room = getRoom(stageCode);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

function serveIndex(res) {
  fs.readFile(INDEX_FILE, (error, data) => {
    if (error) {
      sendJson(res, 500, { ok: false, error: "Could not read index.html" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": data.length
    });
    res.end(data);
  });
}

function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, rooms: rooms.size });
    return;
  }

  const eventMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/events$/i);
  if (req.method === "GET" && eventMatch) {
    handleStageEvents(req, res, normalizeStageCode(eventMatch[1]));
    return;
  }

  const lobbyMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/lobby$/i);
  if (req.method === "GET" && lobbyMatch) {
    handleLobby(req, res, normalizeStageCode(lobbyMatch[1]));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/join") {
    handleJoin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/heartbeat") {
    handleHeartbeat(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/leave") {
    handleLeave(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/start") {
    handleStart(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveIndex(res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed" });
}

function sweepInactivePlayers() {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    for (const player of room.players.values()) {
      if (player.active && now - player.lastSeen > CONTROLLER_TIMEOUT_MS) {
        player.active = false;
        changed = true;
      }
    }
    if (changed) {
      selectVip(room);
      broadcastLobby(room);
    }
  }
}

function getLanUrls() {
  const urls = [];
  for (const network of Object.values(os.networkInterfaces())) {
    for (const details of network || []) {
      if (details.family === "IPv4" && !details.internal) {
        urls.push(`http://${details.address}:${PORT}`);
      }
    }
  }
  return urls;
}

setInterval(sweepInactivePlayers, 2000);

const server = http.createServer(router);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Flip 7 Party server running at http://localhost:${PORT}`);
  for (const url of getLanUrls()) {
    console.log(`LAN URL: ${url}`);
  }
});
