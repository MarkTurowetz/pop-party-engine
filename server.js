const http = require("http");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");
const PACKAGE_FILE = path.join(ROOT, "package.json");
const ART_ROOT = path.join(ROOT, "art");
const ART_DEFAULT_DIR = path.join(ART_ROOT, "default");
const ART_CUSTOM_DIR = path.join(ART_ROOT, "custom");
const ART_MANIFEST_FILE = path.join(ART_ROOT, "art-manifest.json");
const CONTROLLER_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 25000;
const START_COUNTDOWN_MS = 3000;
const START_GO_HOLD_MS = 700;
const INTRO_ACTIONS = [
  { type: "present", text: "This is test number 1" },
  { type: "present", text: "Now test 2" },
  { type: "text", text: "this text was not presented so we can't click to continue" }
];

const rooms = new Map();
const avatarColors = ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff"];
const avatarShapes = ["rex", "stego", "trike", "raptor", "bronto", "ankylo"];
const acceptedArtTypes = {
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/jpeg": ".jpg",
  "image/webp": ".webp"
};
const artAssets = [
  { id: "avatar-frame", name: "Shared Avatar Frame", category: "Player Avatar", parent: "player-avatar", defaultFile: "avatar-frame.svg", use: "Shared frame layer used by every player avatar", sharedBy: ["Rex Avatar", "Stego Avatar", "Trike Avatar", "Raptor Avatar", "Bronto Avatar", "Ankylo Avatar"] },
  { id: "avatar-rex", name: "Rex Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-rex.svg", use: "Dinosaur silhouette layer for rex slots" },
  { id: "avatar-stego", name: "Stego Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-stego.svg", use: "Dinosaur silhouette layer for stego slots" },
  { id: "avatar-trike", name: "Trike Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-trike.svg", use: "Dinosaur silhouette layer for trike slots" },
  { id: "avatar-raptor", name: "Raptor Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-raptor.svg", use: "Dinosaur silhouette layer for raptor slots" },
  { id: "avatar-bronto", name: "Bronto Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-bronto.svg", use: "Dinosaur silhouette layer for bronto slots" },
  { id: "avatar-ankylo", name: "Ankylo Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-ankylo.svg", use: "Dinosaur silhouette layer for ankylo slots" },
  { id: "presentation-click-cursor", name: "Presentation Click Cursor", category: "Presentation Click Prompt", parent: "presentation-click-prompt", defaultFile: "cursor-arrow.svg", use: "Cursor art for presented-text click prompt" }
];
const artGroups = [
  { id: "player-avatar", name: "Player Avatar", description: "Composed from the shared avatar frame plus one dinosaur silhouette." },
  { id: "presentation-click-prompt", name: "Presentation Click Prompt", description: "Standalone cursor art; it does not use the avatar frame." }
];

function readAppVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
    const buildNumber = readBuildNumber();
    return buildNumber ? `${manifest.version}.${buildNumber}` : manifest.version || "0.0.0";
  } catch (error) {
    return "0.0.0";
  }
}

function readBuildNumber() {
  try {
    return childProcess.execSync("git rev-list --count HEAD", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

const APP_VERSION = readAppVersion();

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

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function readJson(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
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

function readArtManifest() {
  try {
    return JSON.parse(fs.readFileSync(ART_MANIFEST_FILE, "utf8"));
  } catch (error) {
    return {};
  }
}

function writeArtManifest(manifest) {
  fs.mkdirSync(ART_ROOT, { recursive: true });
  fs.mkdirSync(ART_CUSTOM_DIR, { recursive: true });
  fs.writeFileSync(ART_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

function cacheBustFileUrl(filePath, urlPath) {
  try {
    const version = Math.round(fs.statSync(filePath).mtimeMs);
    return `${urlPath}?v=${version}`;
  } catch (error) {
    return urlPath;
  }
}

function publicArtAsset(asset, manifest) {
  const custom = manifest[asset.id] || null;
  const defaultFilePath = path.join(ART_DEFAULT_DIR, asset.defaultFile);
  const defaultUrl = cacheBustFileUrl(defaultFilePath, `/art/default/${asset.defaultFile}`);
  const customFile = custom?.fileName ? path.basename(custom.fileName) : "";
  const customFilePath = customFile ? path.join(ART_CUSTOM_DIR, customFile) : "";
  const hasCustom = Boolean(customFile && fs.existsSync(customFilePath));
  const currentUrl = hasCustom ? cacheBustFileUrl(customFilePath, `/art/custom/${customFile}`) : defaultUrl;
  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    parent: asset.parent,
    use: asset.use,
    sharedBy: asset.sharedBy || [],
    expectedTypes: Object.keys(acceptedArtTypes),
    defaultUrl,
    currentUrl,
    hasCustom,
    fileName: hasCustom ? customFile : asset.defaultFile,
    updatedAt: hasCustom ? custom.updatedAt : null
  };
}

function sendArtAssetList(res) {
  const manifest = readArtManifest();
  sendJson(res, 200, {
    ok: true,
    groups: artGroups,
    assets: artAssets.map((asset) => publicArtAsset(asset, manifest))
  });
}

async function handleReplaceArtAsset(req, res, assetId) {
  const asset = artAssets.find((item) => item.id === assetId);
  if (!asset) {
    sendJson(res, 404, { ok: false, error: "Art asset not found" });
    return;
  }

  let payload;
  try {
    payload = await readJson(req, 7 * 1024 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const dataUrl = String(payload.dataUrl || "");
  const fileName = path.basename(String(payload.fileName || "replacement"));
  const mimeType = String(payload.mimeType || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || match[1] !== mimeType || !acceptedArtTypes[mimeType]) {
    sendJson(res, 400, { ok: false, error: "Use a PNG, SVG, JPG, or WEBP file." });
    return;
  }

  const originalExt = path.extname(fileName).toLowerCase();
  const expectedExt = acceptedArtTypes[mimeType];
  const ext = originalExt === ".jpeg" ? ".jpg" : originalExt;
  if (ext && ext !== expectedExt) {
    sendJson(res, 400, { ok: false, error: `Selected file does not match ${mimeType}.` });
    return;
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    sendJson(res, 400, { ok: false, error: "Replacement art must be under 5 MB." });
    return;
  }

  fs.mkdirSync(ART_CUSTOM_DIR, { recursive: true });
  const manifest = readArtManifest();
  const previousFile = manifest[asset.id]?.fileName;
  if (previousFile) {
    const previousPath = path.join(ART_CUSTOM_DIR, path.basename(previousFile));
    if (fs.existsSync(previousPath)) {
      try {
        fs.unlinkSync(previousPath);
      } catch (error) {
        // A stale file is harmless; keep saving the new active asset.
      }
    }
  }

  const savedFileName = `${asset.id}${expectedExt}`;
  fs.writeFileSync(path.join(ART_CUSTOM_DIR, savedFileName), buffer);
  manifest[asset.id] = {
    fileName: savedFileName,
    sourceName: fileName,
    mimeType,
    updatedAt: new Date().toISOString()
  };
  writeArtManifest(manifest);
  sendJson(res, 200, { ok: true, asset: publicArtAsset(asset, manifest) });
}

function serveArtFile(res, kind, fileName) {
  const safeName = path.basename(fileName || "");
  const dir = kind === "custom" ? ART_CUSTOM_DIR : ART_DEFAULT_DIR;
  const filePath = path.join(dir, safeName);
  if (!safeName || !filePath.startsWith(dir) || !fs.existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: "Art file not found" });
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 500, { ok: false, error: "Could not read art file" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentTypeForFile(filePath),
      "Content-Length": data.length,
      "Cache-Control": "no-cache"
    });
    res.end(data);
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
      phase: "lobby",
      countdownStartedAt: 0,
      countdownEndsAt: 0,
      countdownTimerId: null,
      actionIndex: 0,
      presentedAction: null,
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
  if (room.phase === "intro" && room.actionIndex >= INTRO_ACTIONS.length) {
    room.actionIndex = Math.max(0, INTRO_ACTIONS.length - 1);
  }
  const currentAction = room.phase === "intro" ? room.presentedAction || INTRO_ACTIONS[room.actionIndex] || null : null;
  return {
    type: "lobby",
    stageCode: room.stageCode,
    revision: room.revision,
    phase: room.phase,
    countdownStartedAt: room.countdownStartedAt,
    countdownEndsAt: room.countdownEndsAt,
    action: currentAction ? { index: room.actionIndex, ...currentAction } : null,
    serverNow: Date.now(),
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

function clearCountdownTimer(room) {
  if (!room.countdownTimerId) return;
  clearTimeout(room.countdownTimerId);
  room.countdownTimerId = null;
}

function enterLobbyPhase(room) {
  clearCountdownTimer(room);
  room.phase = "lobby";
  room.countdownStartedAt = 0;
  room.countdownEndsAt = 0;
  room.actionIndex = 0;
  room.presentedAction = null;
}

function enterIntroPhase(room) {
  clearCountdownTimer(room);
  room.phase = "intro";
  room.countdownStartedAt = 0;
  room.countdownEndsAt = 0;
  room.actionIndex = 0;
  room.presentedAction = null;
  broadcastLobby(room);
}

function enterStartingPhase(room) {
  const now = Date.now();
  clearCountdownTimer(room);
  room.phase = "starting";
  room.countdownStartedAt = now;
  room.countdownEndsAt = now + START_COUNTDOWN_MS;
  room.countdownTimerId = setTimeout(() => {
    enterIntroPhase(room);
  }, START_COUNTDOWN_MS + START_GO_HOLD_MS);
  broadcastLobby(room);
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
  if (room.phase === "intro") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }
  if (room.phase === "starting") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  enterStartingPhase(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleCancelStart(req, res) {
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
    sendJson(res, 403, { ok: false, error: "Only the VIP can cancel the start" });
    return;
  }
  if (!payload.startToken || payload.startToken !== room.startToken) {
    sendJson(res, 403, { ok: false, error: "Cancel request is stale" });
    return;
  }
  if (room.phase !== "starting") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }
  if (Date.now() >= room.countdownEndsAt) {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  enterLobbyPhase(room);
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleAdvancePresentation(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const room = getExistingRoom(stageCode);
  if (!room) {
    sendJson(res, 404, { ok: false, error: "Room not found" });
    return;
  }

  if (room.phase === "intro" && room.presentedAction?.type === "present") {
    room.presentedAction = null;
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  const currentAction = room.phase === "intro" ? INTRO_ACTIONS[room.actionIndex] : null;
  if (!currentAction || currentAction.type !== "present") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  room.actionIndex = Math.min(room.actionIndex + 1, INTRO_ACTIONS.length - 1);
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handlePresentHi(req, res) {
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
    sendJson(res, 403, { ok: false, error: "Only the VIP can present text" });
    return;
  }
  if (!payload.startToken || payload.startToken !== room.startToken) {
    sendJson(res, 403, { ok: false, error: "Present request is stale" });
    return;
  }
  if (room.phase !== "intro") {
    sendJson(res, 409, { ok: false, error: "Text can only be presented during the game intro" });
    return;
  }

  room.presentedAction = { type: "present", text: "HI THERE" };
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
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
    const html = String(data).replaceAll("__APP_VERSION__", APP_VERSION);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html)
    });
    res.end(html);
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

  if (req.method === "GET" && url.pathname === "/api/art-assets") {
    sendArtAssetList(res);
    return;
  }

  const artAssetMatch = url.pathname.match(/^\/api\/art-assets\/([a-z0-9-]+)$/i);
  if (req.method === "POST" && artAssetMatch) {
    handleReplaceArtAsset(req, res, artAssetMatch[1]);
    return;
  }

  const artFileMatch = url.pathname.match(/^\/art\/(default|custom)\/([^/]+)$/i);
  if (req.method === "GET" && artFileMatch) {
    serveArtFile(res, artFileMatch[1], artFileMatch[2]);
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

  if (req.method === "POST" && url.pathname === "/api/cancel-start") {
    handleCancelStart(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/advance-presentation") {
    handleAdvancePresentation(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/present-hi") {
    handlePresentHi(req, res);
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
