const fs = require("fs");
const path = require("path");

function createArtAssetsRuntime({
  acceptedArtTypes,
  artAssets,
  artGroups,
  artRoot,
  contentTypeForFile,
  customDir,
  defaultDir,
  manifestFile,
  readJson,
  sendJson
}) {
  function readArtManifest() {
    try {
      return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    } catch (error) {
      return {};
    }
  }

  function writeArtManifest(manifest) {
    fs.mkdirSync(artRoot, { recursive: true });
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
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
    const defaultFilePath = path.join(defaultDir, asset.defaultFile);
    const defaultUrl = cacheBustFileUrl(defaultFilePath, `/art/default/${asset.defaultFile}`);
    const customFile = custom?.fileName ? path.basename(custom.fileName) : "";
    const customFilePath = customFile ? path.join(customDir, customFile) : "";
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

    fs.mkdirSync(customDir, { recursive: true });
    const manifest = readArtManifest();
    const previousFile = manifest[asset.id]?.fileName;
    if (previousFile) {
      const previousPath = path.join(customDir, path.basename(previousFile));
      if (fs.existsSync(previousPath)) {
        try {
          fs.unlinkSync(previousPath);
        } catch (error) {
          // A stale file is harmless; keep saving the new active asset.
        }
      }
    }

    const savedFileName = `${asset.id}${expectedExt}`;
    fs.writeFileSync(path.join(customDir, savedFileName), buffer);
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
    const dir = kind === "custom" ? customDir : defaultDir;
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

  return {
    handleReplaceArtAsset,
    publicArtAsset,
    readArtManifest,
    sendArtAssetList,
    serveArtFile
  };
}

module.exports = { createArtAssetsRuntime };
