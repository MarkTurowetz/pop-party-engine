const fs = require("fs");
const path = require("path");

function createArtAssetsRuntime({
  acceptedArtTypes,
  artCompositions = [],
  artAssets,
  artGroups,
  artRoot,
  contentTypeForFile,
  customDir,
  defaultDir,
  manifestFile,
  onArtAssetsChanged = () => {},
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

  function cleanNumber(value, fallback, min = -Infinity, max = Infinity) {
    const next = Number(value);
    if (!Number.isFinite(next)) return fallback;
    return Math.max(min, Math.min(max, Number(next.toFixed(3))));
  }

  function cleanColor(value, fallback) {
    const text = String(value ?? "").trim();
    if (text === "transparent") return text;
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  function normalizeComponent(component, fallback) {
    const kind = fallback.kind || "shape";
    const normalized = {
      id: fallback.id,
      name: fallback.name,
      kind,
      x: cleanNumber(component?.x, Number(fallback.x || 0)),
      y: cleanNumber(component?.y, Number(fallback.y || 0)),
      width: cleanNumber(component?.width, Number(fallback.width || 1), 1),
      height: cleanNumber(component?.height, Number(fallback.height || 1), 1),
      scale: cleanNumber(component?.scale, Number(fallback.scale || 1), 0.05, 8)
    };
    if (kind === "text" || kind === "badge") {
      normalized.defaultText = String(component?.defaultText ?? fallback.defaultText ?? "");
      normalized.fontSize = cleanNumber(component?.fontSize, Number(fallback.fontSize || 16), 6, 240);
      normalized.fontColor = cleanColor(component?.fontColor, fallback.fontColor || "#17131f");
    }
    if (kind === "shape" || kind === "container" || kind === "badge") {
      normalized.fillColor = cleanColor(component?.fillColor, fallback.fillColor || "transparent");
      normalized.borderColor = cleanColor(component?.borderColor, fallback.borderColor || "transparent");
      normalized.borderWidth = cleanNumber(component?.borderWidth, Number(fallback.borderWidth || 0), 0, 80);
      normalized.borderRadius = cleanNumber(component?.borderRadius, Number(fallback.borderRadius || 0), 0, 999);
    }
    return normalized;
  }

  function normalizeComposition(composition, override = null) {
    const savedById = new Map((override?.components || []).map((component) => [component.id, component]));
    const hasSavedVoteCount = savedById.has("vote-count");
    return {
      id: composition.id,
      name: composition.name,
      description: composition.description || "",
      canvas: {
        width: cleanNumber(override?.canvas?.width, Number(composition.canvas?.width || 1), 1),
        height: cleanNumber(override?.canvas?.height, Number(composition.canvas?.height || 1), 1)
      },
      components: (composition.components || []).map((component) => {
        let savedComponent = savedById.get(component.id) || (component.id === "vote-count" ? savedById.get("vote-widget") : null);
        if (component.id === "vote-widget" && savedComponent && !hasSavedVoteCount) {
          savedComponent = { ...savedComponent, x: component.x, y: component.y };
        }
        return normalizeComponent(savedComponent, component);
      }),
      updatedAt: override?.updatedAt || null
    };
  }

  function publicArtComposition(composition, manifest) {
    return normalizeComposition(composition, manifest.compositions?.[composition.id] || null);
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
      assets: artAssets.map((asset) => publicArtAsset(asset, manifest)),
      compositions: artCompositions.map((composition) => publicArtComposition(composition, manifest))
    });
  }

  async function handleSaveArtComposition(req, res, compositionId) {
    const definition = artCompositions.find((item) => item.id === compositionId);
    if (!definition) {
      sendJson(res, 404, { ok: false, error: "Art composition not found" });
      return;
    }

    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const normalized = normalizeComposition(definition, payload.composition || payload);
    const manifest = readArtManifest();
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    manifest.compositions[definition.id] = {
      canvas: normalized.canvas,
      components: normalized.components,
      updatedAt: new Date().toISOString()
    };
    writeArtManifest(manifest);
    onArtAssetsChanged({ type: "composition", id: definition.id, updatedAt: manifest.compositions[definition.id].updatedAt });
    sendJson(res, 200, { ok: true, composition: publicArtComposition(definition, readArtManifest()) });
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
    const updatedAt = new Date().toISOString();
    manifest[asset.id] = {
      fileName: savedFileName,
      sourceName: fileName,
      mimeType,
      updatedAt
    };
    writeArtManifest(manifest);
    onArtAssetsChanged({ type: "asset", id: asset.id, updatedAt });
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
    handleSaveArtComposition,
    handleReplaceArtAsset,
    publicArtAsset,
    publicArtComposition,
    readArtManifest,
    sendArtAssetList,
    serveArtFile
  };
}

module.exports = { createArtAssetsRuntime };
