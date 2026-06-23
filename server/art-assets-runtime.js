const fs = require("fs");
const path = require("path");
const artComponentSchema = require("../shared/art-component-schema");

function createArtAssetsRuntime({
  acceptedArtTypes,
  artCompositions = [],
  artAssets,
  artGroups,
  artRoot,
  contentTypeForFile,
  customDir,
  defaultDir,
  loadArtManifestSource = null,
  manifestFile,
  onArtAssetsChanged = () => {},
  readJson,
  sendJson,
  writeArtManifestSource = null
}) {
  const knownCompositionIds = new Set(artCompositions.map((composition) => composition.id));

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

  async function loadArtManifest() {
    if (typeof loadArtManifestSource === "function") {
      const manifest = await loadArtManifestSource();
      return manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {};
    }
    return readArtManifest();
  }

  async function saveArtManifest(manifest) {
    if (typeof writeArtManifestSource === "function") {
      const saved = await writeArtManifestSource(manifest);
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : manifest;
    }
    writeArtManifest(manifest);
    return manifest;
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

  function cleanId(value, fallback = "") {
    const text = String(value || fallback || "").trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text : fallback;
  }

  function cleanText(value, fallback = "", maxLength = 120) {
    const text = String(value ?? fallback ?? "").trim();
    return text.slice(0, maxLength);
  }

  function cleanImageName(value, fallback = "Uploaded image") {
    return cleanText(path.basename(String(value || fallback)), fallback, 180);
  }

  function normalizeComponentKind(value, fallback = "shape") {
    return artComponentSchema.normalizeComponentKind(value, fallback);
  }

  function defaultComponentName(kind) {
    return artComponentSchema.componentKindLabel(kind);
  }

  function normalizeComponentImageMask(source = {}, base = {}) {
    const dataUrl = String(source.imageDataUrl || base.imageDataUrl || "").trim();
    if (!dataUrl) return null;
    const parsed = artComponentSchema.parseImageDataUrl(dataUrl);
    if (!parsed || !acceptedArtTypes[parsed.mimeType]) return null;
    const byteLength = artComponentSchema.imageBase64ByteLength(parsed.base64);
    if (byteLength === 0 || byteLength > artComponentSchema.componentImageMaxBytes) return null;
    return {
      imageDataUrl: dataUrl,
      imageName: cleanImageName(source.imageName, base.imageName || "Uploaded image"),
      imageMimeType: parsed.mimeType,
      imageObjectFit: artComponentSchema.normalizeImageObjectFit(source.imageObjectFit || base.imageObjectFit)
    };
  }

  function normalizeComponent(component, fallback = {}) {
    const source = component && typeof component === "object" && !Array.isArray(component) ? component : {};
    const base = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
    const kind = normalizeComponentKind(source.kind || base.kind);
    const id = cleanId(base.id || source.id);
    if (!id) return null;
    const normalized = {
      id,
      name: cleanText(source.name, base.name || defaultComponentName(kind)),
      kind,
      x: cleanNumber(source.x, Number(base.x || 0)),
      y: cleanNumber(source.y, Number(base.y || 0)),
      width: cleanNumber(source.width, Number(base.width || 1), 1),
      height: cleanNumber(source.height, Number(base.height || 1), 1),
      scale: cleanNumber(source.scale, Number(base.scale || 1), 0.05, 8)
    };
    if (kind === "text" || kind === "badge") {
      normalized.defaultText = cleanText(source.defaultText, base.defaultText || "", 500);
      normalized.fontSize = cleanNumber(source.fontSize, Number(base.fontSize || 16), 6, 240);
      normalized.fontColor = cleanColor(source.fontColor, base.fontColor || "#17131f");
    }
    if (kind === "shape" || kind === "container" || kind === "badge") {
      normalized.shapeStyle = artComponentSchema.normalizeShapeStyle(source.shapeStyle || base.shapeStyle, kind);
      normalized.fillColor = cleanColor(source.fillColor, base.fillColor || "transparent");
      normalized.borderColor = cleanColor(source.borderColor, base.borderColor || "transparent");
      normalized.borderWidth = cleanNumber(source.borderWidth, Number(base.borderWidth || 0), 0, 80);
      normalized.borderRadius = cleanNumber(source.borderRadius, Number(base.borderRadius || 0), 0, 999);
    }
    if (artComponentSchema.componentSupportsImageMask(kind)) {
      const imageMask = normalizeComponentImageMask(source, base);
      if (imageMask) Object.assign(normalized, imageMask);
    }

    const fallbackChildren = new Map((Array.isArray(base.children) ? base.children : []).map((child) => [child.id, child]));
    const sourceChildren = Array.isArray(source.children)
      ? source.children
      : Array.isArray(base.children)
        ? base.children
        : [];
    const children = [];
    const seenChildren = new Set();
    for (const child of sourceChildren) {
      const childId = cleanId(child?.id);
      const fallbackChild = fallbackChildren.get(childId) || {};
      const normalizedChild = normalizeComponent(child, fallbackChild);
      if (normalizedChild && !seenChildren.has(normalizedChild.id)) {
        children.push(normalizedChild);
        seenChildren.add(normalizedChild.id);
      }
    }
    if (Array.isArray(source.children)) {
      for (const fallbackChild of fallbackChildren.values()) {
        const normalizedChild = normalizeComponent(fallbackChild, fallbackChild);
        if (normalizedChild && !seenChildren.has(normalizedChild.id)) {
          children.push(normalizedChild);
          seenChildren.add(normalizedChild.id);
        }
      }
    }
    if (children.length) {
      normalized.children = children;
    }
    return normalized;
  }

  function normalizeComposition(composition, override = null) {
    const savedById = new Map((override?.components || []).map((component) => [component.id, component]));
    const hasSavedVoteCount = savedById.has("vote-count");
    const usedIds = new Set();
    const components = [];
    for (const component of composition.components || []) {
      let savedComponent = savedById.get(component.id) || (component.id === "vote-count" ? savedById.get("vote-widget") : null);
      if (component.id === "vote-widget" && savedComponent && !hasSavedVoteCount) {
        savedComponent = { ...savedComponent, x: component.x, y: component.y };
      }
      const normalizedComponent = normalizeComponent(savedComponent, component);
      if (normalizedComponent) {
        components.push(normalizedComponent);
        usedIds.add(normalizedComponent.id);
        if (savedComponent?.id) usedIds.add(savedComponent.id);
      }
    }
    for (const component of override?.components || []) {
      const componentId = cleanId(component?.id);
      if (!componentId || usedIds.has(componentId)) continue;
      const normalizedComponent = normalizeComponent(component, component);
      if (normalizedComponent) {
        components.push(normalizedComponent);
        usedIds.add(normalizedComponent.id);
      }
    }
    return {
      id: composition.id,
      name: cleanText(override?.name, composition.name || "Art Asset"),
      description: cleanText(override?.description, composition.description || "Editable art asset.", 240),
      isCustom: Boolean(composition.isCustom || override?.isCustom),
      canvas: {
        width: cleanNumber(override?.canvas?.width, Number(composition.canvas?.width || 1), 1),
        height: cleanNumber(override?.canvas?.height, Number(composition.canvas?.height || 1), 1)
      },
      components,
      updatedAt: override?.updatedAt || null
    };
  }

  function publicArtComposition(composition, manifest) {
    return normalizeComposition(composition, manifest.compositions?.[composition.id] || null);
  }

  function customArtCompositionDefinitions(manifest) {
    const definitions = [];
    const manifestCompositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    for (const [compositionId, composition] of Object.entries(manifestCompositions)) {
      const id = cleanId(compositionId);
      if (!id || knownCompositionIds.has(id)) continue;
      definitions.push({
        id,
        name: cleanText(composition?.name, "Art Asset"),
        description: cleanText(composition?.description, "Editable art asset.", 240),
        isCustom: true,
        canvas: composition?.canvas || { width: 560, height: 230 },
        components: []
      });
    }
    return definitions;
  }

  function allPublicArtCompositions(manifest) {
    return [
      ...artCompositions.map((composition) => publicArtComposition(composition, manifest)),
      ...customArtCompositionDefinitions(manifest).map((composition) => publicArtComposition(composition, manifest))
    ];
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

  async function sendArtAssetList(res) {
    const manifest = await loadArtManifest();
    sendJson(res, 200, {
      ok: true,
      groups: artGroups,
      assets: artAssets.map((asset) => publicArtAsset(asset, manifest)),
      compositions: allPublicArtCompositions(manifest)
    });
  }

  async function handleSaveArtComposition(req, res, compositionId) {
    const safeCompositionId = cleanId(compositionId);
    if (!safeCompositionId || safeCompositionId !== String(compositionId || "").toLowerCase()) {
      sendJson(res, 400, { ok: false, error: "Invalid art composition id" });
      return;
    }

    let payload;
    try {
      payload = await readJson(req, 8 * 1024 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const manifest = await loadArtManifest();
    const incoming = payload.composition || payload;
    const savedDefinition = manifest.compositions?.[safeCompositionId] || null;
    const definition = artCompositions.find((item) => item.id === safeCompositionId) || {
      id: safeCompositionId,
      name: cleanText(incoming?.name, savedDefinition?.name || "Art Asset"),
      description: cleanText(incoming?.description, savedDefinition?.description || "Editable art asset.", 240),
      isCustom: true,
      canvas: incoming?.canvas || savedDefinition?.canvas || { width: 560, height: 230 },
      components: []
    };
    const normalized = normalizeComposition(definition, incoming);
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    manifest.compositions[definition.id] = {
      name: normalized.name,
      description: normalized.description,
      isCustom: normalized.isCustom,
      canvas: normalized.canvas,
      components: normalized.components,
      updatedAt: new Date().toISOString()
    };
    const savedManifest = await saveArtManifest(manifest);
    onArtAssetsChanged({ type: "composition", id: definition.id, updatedAt: savedManifest.compositions?.[definition.id]?.updatedAt || manifest.compositions[definition.id].updatedAt });
    sendJson(res, 200, { ok: true, composition: publicArtComposition(definition, savedManifest) });
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
    const manifest = await loadArtManifest();
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
    const savedManifest = await saveArtManifest(manifest);
    onArtAssetsChanged({ type: "asset", id: asset.id, updatedAt });
    sendJson(res, 200, { ok: true, asset: publicArtAsset(asset, savedManifest) });
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
