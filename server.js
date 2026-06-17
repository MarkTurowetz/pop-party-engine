const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");
const rooms = new Map();
const messageHistory = new Map();
let nextMessageSeq = 1;

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
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
  if (!rooms.has(stageCode)) rooms.set(stageCode, new Set());
  return rooms.get(stageCode);
}

function removeClient(stageCode, client) {
  const room = rooms.get(stageCode);
  if (!room) return;
  room.delete(client);
  if (room.size === 0) rooms.delete(stageCode);
}

function sendSse(client, event, data) {
  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(data)}\n\n`);
}

function rememberMessage(stageCode, event) {
  const messages = messageHistory.get(stageCode) || [];
  messages.push(event);
  while (messages.length > 50) messages.shift();
  messageHistory.set(stageCode, messages);
}

function handleStageEvents(req, res, stageCode) {
  if (!stageCode) {
    sendJson(res, 400, { ok: false, error: "Missing stage code" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(": connected\n\n");

  const room = getRoom(stageCode);
  room.add(res);
  sendSse(res, "ready", { stageCode, connectedStages: room.size });

  const heartbeat = setInterval(() => {
    sendSse(res, "ping", { sentAt: Date.now() });
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(stageCode, res);
  });
}

async function handlePop(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const text = String(payload.text || "").trim().slice(0, 80);
  const playerId = String(payload.playerId || "P???").trim().slice(0, 10);

  if (!stageCode || !text) {
    sendJson(res, 400, { ok: false, error: "Stage code and text are required" });
    return;
  }

  const event = {
    type: "pop",
    id: String(payload.id || `${playerId}-${Date.now()}`),
    seq: nextMessageSeq,
    playerId,
    stageCode,
    text,
    color: String(payload.color || "#2458ff").slice(0, 32),
    sentAt: Number(payload.sentAt || Date.now())
  };
  nextMessageSeq += 1;
  rememberMessage(stageCode, event);

  const room = rooms.get(stageCode);
  const delivered = room ? room.size : 0;
  if (room) {
    for (const client of room) {
      sendSse(client, "pop", event);
    }
  }

  sendJson(res, 200, { ok: true, delivered });
}

function handleStageMessages(url, res, stageCode) {
  if (!stageCode) {
    sendJson(res, 400, { ok: false, error: "Missing stage code" });
    return;
  }

  const after = Number(url.searchParams.get("after") || 0);
  const messages = (messageHistory.get(stageCode) || []).filter((message) => message.seq > after);
  sendJson(res, 200, { ok: true, messages });
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

  const messagesMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/messages$/i);
  if (req.method === "GET" && messagesMatch) {
    handleStageMessages(url, res, normalizeStageCode(messagesMatch[1]));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/pop") {
    handlePop(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveIndex(res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed" });
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

const server = http.createServer(router);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Pop Party server running at http://localhost:${PORT}`);
  for (const url of getLanUrls()) {
    console.log(`LAN URL: ${url}`);
  }
});
