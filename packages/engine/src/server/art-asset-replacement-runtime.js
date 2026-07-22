"use strict";

const path = require("path");

const defaultMaxBytes = 5 * 1024 * 1024;

function cleanFileName(value, fallback = "replacement") {
  return path.basename(String(value || fallback)).trim().slice(0, 180) || fallback;
}

function parseArtAssetReplacement(source = {}, { acceptedArtTypes = {}, maxBytes = defaultMaxBytes } = {}) {
  const dataUrl = String(source?.dataUrl || "");
  const mimeType = String(source?.mimeType || "");
  const fileName = cleanFileName(source?.fileName);
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || match[1] !== mimeType || !acceptedArtTypes[mimeType]) {
    throw new Error("Use a PNG, SVG, JPG, or WEBP file");
  }
  const originalExtension = path.extname(fileName).toLowerCase();
  const expectedExtension = acceptedArtTypes[mimeType];
  const extension = originalExtension === ".jpeg" ? ".jpg" : originalExtension;
  if (extension && extension !== expectedExtension) {
    throw new Error(`Selected file does not match ${mimeType}`);
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error("Replacement art must be under 5 MB");
  }
  return Object.freeze({ buffer, dataUrl, expectedExtension, fileName, mimeType });
}

function normalizeArtAssetReplacementsDraft(source = {}, {
  acceptedArtTypes = {},
  artAssets = [],
  now = () => new Date().toISOString()
} = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Art asset replacement draft must be an object");
  }
  const assetsById = new Map(artAssets.map((asset) => [asset.id, asset]));
  const replacements = {};
  for (const [assetId, replacement] of Object.entries(source)) {
    const asset = assetsById.get(assetId);
    if (!asset) throw new Error(`Unknown art asset id: ${assetId}`);
    const parsed = parseArtAssetReplacement(replacement, { acceptedArtTypes });
    const fallbackUpdatedAt = now();
    const updatedAt = String(replacement?.updatedAt ?? fallbackUpdatedAt).trim().slice(0, 40) || fallbackUpdatedAt;
    replacements[asset.id] = {
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      dataUrl: parsed.dataUrl,
      updatedAt
    };
  }
  return replacements;
}

module.exports = Object.freeze({ normalizeArtAssetReplacementsDraft, parseArtAssetReplacement });
