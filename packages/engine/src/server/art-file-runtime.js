"use strict";

const fs = require("fs");
const path = require("path");

function createArtFileRuntime({
  acceptedArtTypes = {},
  contentTypeForFile,
  customDir,
  defaultDir,
  portableAssetUrl = null,
  readDraftReplacement = () => null,
  sendJson,
  svgResponseHeaders = () => ({ "X-Content-Type-Options": "nosniff" })
} = {}) {
  function cacheBustFileUrl(filePath, urlPath) {
    try {
      const version = Math.round(fs.statSync(filePath).mtimeMs);
      return `${urlPath}?v=${version}`;
    } catch (error) {
      return urlPath;
    }
  }

  function resolveArtFilePath(kind, fileName) {
    const directory = kind === "custom" ? customDir : kind === "default" ? defaultDir : "";
    const requestedName = String(fileName || "");
    const safeName = path.basename(requestedName);
    if (!directory || !safeName || safeName !== requestedName) return "";
    const root = path.resolve(directory);
    const filePath = path.resolve(root, safeName);
    if (path.dirname(filePath) !== root || !fs.existsSync(filePath)) return "";
    return filePath;
  }

  function publicArtAsset(asset, manifest = {}) {
    const custom = manifest[asset.id] || null;
    const defaultFile = String(asset.defaultFile || path.posix.basename(String(asset.blobPath || "")));
    const defaultFilePath = path.join(defaultDir, defaultFile);
    const defaultUrl = cacheBustFileUrl(defaultFilePath, `/art/default/${defaultFile}`);
    const portable = Array.isArray(manifest.assets)
      ? manifest.assets.find((candidate) => candidate?.id === asset.id)
      : null;
    const portableFile = path.posix.basename(String(portable?.blobPath || ""));
    if (portable && typeof portableAssetUrl === "function") {
      const url = String(portableAssetUrl(asset, portable) || "");
      const hasReplacement = String(portable?.sha256 || "") !== String(asset.sha256 || "")
        || String(portable?.blobPath || "") !== String(asset.blobPath || "");
      const publicAsset = {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        parent: asset.parent,
        use: asset.use,
        sharedBy: asset.sharedBy || [],
        expectedTypes: Object.keys(acceptedArtTypes),
        defaultUrl: url,
        currentUrl: url,
        hasCustom: hasReplacement,
        fileName: portable?.sourceName || portableFile,
        updatedAt: portable?.updatedAt || null
      };
      const draftReplacement = readDraftReplacement(asset.id);
      return draftReplacement
        ? {
            ...publicAsset,
            currentUrl: draftReplacement.dataUrl,
            hasCustom: true,
            hasDraft: true,
            fileName: draftReplacement.fileName || publicAsset.fileName,
            updatedAt: draftReplacement.updatedAt || null
          }
        : publicAsset;
    }
    const portableFilePath = portableFile ? path.join(defaultDir, portableFile) : "";
    const hasPortableReplacement = Boolean(portableFile
      && fs.existsSync(portableFilePath)
      && (portableFile !== defaultFile || String(portable?.sha256 || "") !== String(asset.sha256 || "")));
    const customFile = custom?.fileName ? path.basename(custom.fileName) : "";
    const customFilePath = customFile ? path.join(customDir, customFile) : "";
    const hasCustom = Boolean(customFile && fs.existsSync(customFilePath));
    const currentUrl = hasCustom
      ? cacheBustFileUrl(customFilePath, `/art/custom/${customFile}`)
      : hasPortableReplacement
        ? cacheBustFileUrl(portableFilePath, `/art/default/${portableFile}`)
        : defaultUrl;
    const publicAsset = {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      parent: asset.parent,
      use: asset.use,
      sharedBy: asset.sharedBy || [],
      expectedTypes: Object.keys(acceptedArtTypes),
      defaultUrl,
      currentUrl,
      hasCustom: hasCustom || hasPortableReplacement,
      fileName: hasCustom ? customFile : portable?.sourceName || portableFile || defaultFile,
      updatedAt: hasCustom ? custom.updatedAt : portable?.updatedAt || null
    };
    const draftReplacement = readDraftReplacement(asset.id);
    if (!draftReplacement) return publicAsset;
    return {
      ...publicAsset,
      currentUrl: draftReplacement.dataUrl,
      hasCustom: true,
      hasDraft: true,
      fileName: draftReplacement.fileName || publicAsset.fileName,
      updatedAt: draftReplacement.updatedAt || null
    };
  }

  function serveArtFile(res, kind, fileName) {
    const filePath = resolveArtFilePath(kind, fileName);
    if (!filePath) {
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
        "Cache-Control": "no-cache",
        ...(path.extname(filePath).toLowerCase() === ".svg" ? svgResponseHeaders() : { "X-Content-Type-Options": "nosniff" })
      });
      res.end(data);
    });
  }

  return Object.freeze({ publicArtAsset, resolveArtFilePath, serveArtFile });
}

module.exports = Object.freeze({ createArtFileRuntime });
