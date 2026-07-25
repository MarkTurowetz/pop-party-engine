"use strict";

const crypto = require("node:crypto");

const ACCEPTED_AUDIO_TYPES = Object.freeze({
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm"
});

function parseAudioDataUrl(value) {
  const match = String(value || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Audio data must be a base64 data URL");
  const mimeType = match[1].toLowerCase();
  const extension = ACCEPTED_AUDIO_TYPES[mimeType];
  if (!extension) throw new Error("Unsupported audio type");
  const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!bytes.length) throw new Error("Audio file is empty");
  if (bytes.length > 12 * 1024 * 1024) throw new Error("Audio file must be 12 MB or smaller");
  return { bytes, mimeType, extension };
}

function createHostAudioAssetsRuntime(options = {}) {
  const authoring = options.authoring;
  const normalizeHostAudios = options.normalizeHostAudios;
  const hostAudiosStore = options.hostAudiosStore;
  const readJson = options.readJson;
  const sendJson = options.sendJson;
  if (typeof normalizeHostAudios !== "function" || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new Error("Host audio assets require normalization and HTTP helpers");
  }

  async function handleUpload(req, res) {
    if (!authoring) {
      sendJson(res, 409, {
        ok: false,
        error: "Durable Host Audio asset authoring is not enabled",
        errorCode: "DURABLE_AUDIO_AUTHORING_DISABLED"
      });
      return;
    }
    let payload;
    try {
      payload = await readJson(req, 18 * 1024 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid audio upload payload" });
      return;
    }
    let parsed;
    try {
      parsed = parseAudioDataUrl(payload.dataUrl);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
      return;
    }
    const hostAudios = normalizeHostAudios(payload.hostAudios);
    const hostAudioId = String(payload.hostAudioId || "");
    const lineId = String(payload.lineId || "");
    const hostAudio = hostAudios.hostAudios.find((candidate) => candidate.id === hostAudioId);
    const line = hostAudio?.lines.find((candidate) => candidate.id === lineId);
    if (!hostAudio || !line) {
      sendJson(res, 400, { ok: false, error: "Host Audio line was not found" });
      return;
    }
    const sha256 = crypto.createHash("sha256").update(parsed.bytes).digest("hex");
    const blobPath = `blobs/${sha256}${parsed.extension}`;
    line.url = "";
    line.blobPath = blobPath;
    line.sha256 = sha256;
    line.mimeType = parsed.mimeType;
    line.sourceName = String(payload.fileName || `host-audio${parsed.extension}`).slice(0, 240);

    try {
      const saved = await authoring.writeFiles({
        [blobPath]: parsed.bytes,
        "audio/host-audios.json": hostAudios
      }, {
        expectedRevision: payload.revision,
        idempotencyKey: payload.idempotencyKey,
        operation: "host-audio-asset"
      });
      const savedHostAudios = normalizeHostAudios(saved.snapshot.readJson("audio/host-audios.json"));
      hostAudiosStore.source = savedHostAudios;
      hostAudiosStore.revision = saved.revision;
      hostAudiosStore.loadedAt = Date.now();
      hostAudiosStore.error = "";
      sendJson(res, 200, {
        ok: true,
        hostAudios: savedHostAudios,
        revision: saved.revision,
        storage: {
          kind: "github-app-draft",
          durable: true,
          error: "",
          repo: "",
          branch: "",
          path: "audio/host-audios.json"
        },
        asset: { blobPath, sha256, mimeType: parsed.mimeType, sourceName: line.sourceName }
      });
    } catch (error) {
      sendJson(res, error?.status === 409 ? 409 : 502, {
        ok: false,
        error: `Host Audio asset could not be saved: ${error.message}`,
        errorCode: error.code || "HOST_AUDIO_ASSET_SAVE_FAILED"
      });
    }
  }

  async function serveDraftAsset(res, hostAudioId, lineId) {
    if (!authoring) {
      sendJson(res, 404, { ok: false, error: "Durable Host Audio asset authoring is not enabled" });
      return;
    }
    try {
      const draft = await authoring.readDraft({ refresh: true });
      const hostAudios = normalizeHostAudios(draft.snapshot.readJson("audio/host-audios.json"));
      const line = hostAudios.hostAudios
        .find((candidate) => candidate.id === String(hostAudioId || ""))
        ?.lines.find((candidate) => candidate.id === String(lineId || ""));
      if (!line?.blobPath) {
        sendJson(res, 404, { ok: false, error: "Host Audio asset not found" });
        return;
      }
      const bytes = draft.snapshot.readBytes(line.blobPath);
      res.writeHead(200, {
        "Content-Type": String(line.mimeType || "application/octet-stream"),
        "Content-Length": bytes.length,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      });
      res.end(bytes);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: "Host Audio asset is invalid" });
    }
  }

  return Object.freeze({ handleUpload, serveDraftAsset });
}

module.exports = Object.freeze({ ACCEPTED_AUDIO_TYPES, createHostAudioAssetsRuntime, parseAudioDataUrl });
