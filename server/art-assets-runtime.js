const fs = require("fs");
const path = require("path");
const artComponentSchema = require("../shared/art-component-schema");
const { normalizeColor } = require("../shared/color-utils");

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
  localDraftStore = null,
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
    return normalizeColor(text) || fallback;
  }

  function cleanId(value, fallback = "") {
    const text = String(value || fallback || "").trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text : fallback;
  }

  function cleanText(value, fallback = "", maxLength = 120) {
    const text = String(value ?? fallback ?? "").trim();
    return text.slice(0, maxLength);
  }

  function normalizeOrganizationItemKey(value) {
    const text = String(value || "").trim().toLowerCase();
    const match = text.match(/^(asset|composition):([a-z0-9][a-z0-9_-]{0,79})$/);
    return match ? `${match[1]}:${match[2]}` : "";
  }

  function normalizeArtOrganization(source = {}) {
    const result = {};
    for (const surface of ["stage", "controller"]) {
      const incoming = source?.[surface] && typeof source[surface] === "object" ? source[surface] : {};
      const folders = [];
      const seenFolders = new Set();
      for (const folder of Array.isArray(incoming.folders) ? incoming.folders : []) {
        const id = cleanId(folder?.id);
        if (!id || seenFolders.has(id)) continue;
        folders.push({ id, name: cleanText(folder?.name, "Folder", 80) || "Folder" });
        seenFolders.add(id);
      }
      const folderIds = new Set(folders.map((folder) => folder.id));
      const order = [];
      const seenOrder = new Set();
      for (const rawKey of Array.isArray(incoming.order) ? incoming.order : []) {
        const rawText = String(rawKey || "").trim().toLowerCase();
        const key = normalizeOrganizationItemKey(rawText) || (rawText.startsWith("folder:") ? `folder:${cleanId(rawText.slice(7))}` : "");
        if (!key || seenOrder.has(key)) continue;
        if (key.startsWith("folder:") && !folderIds.has(key.slice(7))) continue;
        order.push(key);
        seenOrder.add(key);
      }
      const folderItems = {};
      const incomingFolderItems = incoming.folderItems && typeof incoming.folderItems === "object" ? incoming.folderItems : {};
      for (const folderId of folderIds) {
        const items = [];
        const seenItems = new Set();
        for (const rawKey of Array.isArray(incomingFolderItems[folderId]) ? incomingFolderItems[folderId] : []) {
          const key = normalizeOrganizationItemKey(rawKey);
          if (!key || seenItems.has(key)) continue;
          items.push(key);
          seenItems.add(key);
        }
        folderItems[folderId] = items;
      }
      result[surface] = { folders, order, folderItems };
    }
    return result;
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
    const imageAssetId = cleanId(source.imageAssetId, base.imageAssetId || "");
    const dataUrl = String(source.imageDataUrl || base.imageDataUrl || "").trim();
    if (!dataUrl) {
      if (!imageAssetId) return null;
      return {
        imageAssetId,
        imageName: cleanImageName(source.imageName, base.imageName || imageAssetId),
        imageMimeType: "",
        imageObjectFit: artComponentSchema.normalizeImageObjectFit(source.imageObjectFit || base.imageObjectFit),
        imageTint: cleanText(source.imageTint, base.imageTint || "", 40)
      };
    }
    const parsed = artComponentSchema.parseImageDataUrl(dataUrl);
    if (!parsed || !acceptedArtTypes[parsed.mimeType]) return null;
    const byteLength = artComponentSchema.imageBase64ByteLength(parsed.base64);
    if (byteLength === 0 || byteLength > artComponentSchema.componentImageMaxBytes) return null;
    return {
      imageDataUrl: dataUrl,
      imageAssetId,
      imageName: cleanImageName(source.imageName, base.imageName || "Uploaded image"),
      imageMimeType: parsed.mimeType,
      imageObjectFit: artComponentSchema.normalizeImageObjectFit(source.imageObjectFit || base.imageObjectFit),
      imageTint: cleanText(source.imageTint, base.imageTint || "", 40)
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
      scale: cleanNumber(source.scale, Number(base.scale || 1), 0.05, 8),
      rotation: cleanNumber(source.rotation, Number(base.rotation || 0), -3600, 3600),
      defaultAnimationState: cleanText(source.defaultAnimationState, base.defaultAnimationState || "", 24)
    };
    if (kind === "reference") {
      normalized.artCompositionId = cleanId(source.artCompositionId, base.artCompositionId || "");
    }
    if (kind === "text" || kind === "badge") {
      normalized.defaultText = cleanText(source.defaultText, base.defaultText || "", 500);
      normalized.fontSize = cleanNumber(source.fontSize, Number(base.fontSize || 16), 6, 240);
      normalized.autoFitText = source.autoFitText !== false && base.autoFitText !== false;
      normalized.fontColor = cleanColor(source.fontColor, base.fontColor || "#17131f");
    }
    if (kind === "shape" || kind === "container" || kind === "badge") {
      normalized.shapeStyle = artComponentSchema.normalizeShapeStyle(source.shapeStyle || base.shapeStyle, kind);
      normalized.fillColor = cleanColor(source.fillColor, base.fillColor || "transparent");
      normalized.fillCss = artComponentSchema.normalizeFillCss(source.fillCss || base.fillCss);
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

  function normalizeCompositionComponents(defaultComponents = [], savedComponents = null) {
    const defaultById = new Map((defaultComponents || []).map((component) => [component.id, component]));
    const cleanSavedComponents = Array.isArray(savedComponents) ? savedComponents : null;
    const savedById = new Map((cleanSavedComponents || []).map((component) => [cleanId(component?.id), component]).filter(([id]) => id));
    const hasSavedVoteCount = savedById.has("vote-count");
    const usedIds = new Set();
    const components = [];

    const appendComponent = (source, fallback) => {
      const normalizedComponent = normalizeComponent(source, fallback);
      if (!normalizedComponent || usedIds.has(normalizedComponent.id)) return;
      components.push(normalizedComponent);
      usedIds.add(normalizedComponent.id);
    };

    if (cleanSavedComponents) {
      for (const component of cleanSavedComponents) {
        const componentId = cleanId(component?.id);
        if (!componentId || usedIds.has(componentId)) continue;
        const fallback = defaultById.get(componentId) || component;
        const source = componentId === "vote-widget" && !hasSavedVoteCount && defaultById.has(componentId)
          ? { ...component, x: fallback.x, y: fallback.y }
          : component;
        appendComponent(source, fallback);
      }
    }

    for (const component of defaultComponents || []) {
      const componentId = cleanId(component?.id);
      if (!componentId || usedIds.has(componentId)) continue;
      const savedComponent = savedById.get(componentId) || (componentId === "vote-count" ? savedById.get("vote-widget") : null);
      const source = componentId === "vote-widget" && savedComponent && !hasSavedVoteCount
        ? { ...savedComponent, x: component.x, y: component.y }
        : savedComponent || component;
      appendComponent(source, component);
    }

    return components;
  }

  function normalizeComposition(composition, override = null) {
    const components = normalizeCompositionComponents(composition.components || [], override?.components);
    migrateGeneratedStageCodePanelDefaults(composition.id, components);
    migrateGeneratedWidgetDefaults(composition.id, components);
    migrateRemovedWidgetComponents(composition.id, components);
    migrateGeneratedWidgetLayerOrder(composition.id, components);
    const canvas = {
      width: cleanNumber(override?.canvas?.width, Number(composition.canvas?.width || 1), 1),
      height: cleanNumber(override?.canvas?.height, Number(composition.canvas?.height || 1), 1)
    };
    migrateGeneratedWidgetCanvas(composition.id, canvas);
    return {
      id: composition.id,
      name: cleanText(override?.name, composition.name || "Art Asset"),
      description: cleanText(override?.description, composition.description || "Editable art asset.", 240),
      surface: normalizeCompositionSurface(override?.surface || composition.surface),
      isCustom: Boolean(composition.isCustom || override?.isCustom),
      canvas,
      components,
      updatedAt: override?.updatedAt || null
    };
  }

  function normalizeCompositionSurface(surface) {
    return surface === "controller" ? "controller" : "stage";
  }

  function migrateGeneratedStageCodePanelDefaults(compositionId, components = []) {
    if (compositionId !== "stage-code-panel") return;
    const byId = new Map((components || []).map((component) => [component.id, component]));
    const card = byId.get("panel-card");
    if (card
      && card.width === 540
      && card.height === 170
      && card.fillColor === "#fff8d6"
      && card.borderRadius === 18) {
      card.width = 560;
      card.height = 190;
      card.fillColor = "#ffe256";
      card.borderRadius = 24;
    }
    const label = byId.get("panel-label");
    if (label
      && label.defaultText === "STAGE"
      && label.fontSize === 24
      && label.autoFitText === true) {
      label.y = 54;
      label.width = 420;
      label.height = 34;
      label.defaultText = "STAGE CODE";
      label.fontSize = 22;
    }
    const code = byId.get("panel-code");
    if (code
      && code.fontSize === 72
      && code.autoFitText === true) {
      code.y = 120;
      code.width = 500;
      code.height = 105;
      code.fontSize = 112;
    }
  }

  function migrateGeneratedWidgetCanvas(compositionId, canvas = {}) {
    if (compositionId === "stage-code-widget" && canvas.width === 210 && canvas.height === 112) {
      canvas.width = 170;
      canvas.height = 82;
    }
    if (compositionId === "crafting-timer-widget" && canvas.width === 190 && canvas.height === 190) {
      canvas.width = 180;
      canvas.height = 180;
    }
  }

  function migrateGeneratedWidgetDefaults(compositionId, components = []) {
    const byId = new Map((components || []).map((component) => [component.id, component]));
    if (compositionId === "stage-code-widget") {
      const card = byId.get("badge-card");
      if (card && card.width === 190 && card.height === 92 && card.x === 105 && card.y === 56) {
        card.x = 85;
        card.y = 41;
        card.width = 170;
        card.height = 82;
      }
      const label = byId.get("badge-label");
      if (label && label.fontSize === 18 && label.autoFitText === true) {
        label.x = 85;
        label.y = 22;
        label.width = 130;
        label.height = 14;
        label.fontSize = 10;
      }
      const code = byId.get("badge-code");
      if (code && code.fontSize === 42 && code.autoFitText === true) {
        code.x = 85;
        code.y = 50;
        code.width = 140;
        code.height = 32;
        code.fontSize = 32;
      }
    }
    if (compositionId === "join-widget") {
      const text = byId.get("join-text");
      if (text && text.fontColor === "#ffffff" && text.fontSize === 42) {
        text.width = 704;
        text.height = 52;
        text.fontSize = 28;
        text.fontColor = "#17131f";
      }
    }
    if (compositionId === "countdown-popup") {
      const card = byId.get("popup-card");
      if (card && card.fillColor === "#ffe256") {
        card.fillColor = "#60d394";
      }
    }
    if (compositionId === "crafting-timer-widget") {
      const ring = byId.get("timer-ring");
      if (ring && ring.shapeStyle === "circle" && ring.fillColor === "#ffe256") {
        ring.x = 90;
        ring.y = 90;
        ring.width = 180;
        ring.height = 180;
        ring.shapeStyle = "rounded";
        ring.fillColor = "#fffdf4";
        ring.fillCss = "radial-gradient(circle at center, #fffdf4 0 54%, transparent 55%), conic-gradient(#2458ff calc(var(--timer-progress, 1) * 1turn), rgba(23, 19, 31, 0.16) 0)";
        ring.borderWidth = 5;
        ring.borderRadius = 36;
      }
      const value = byId.get("timer-value");
      if (value && value.x === 95 && value.y === 95 && value.fontSize === 72) {
        value.x = 90;
        value.y = 92;
        value.width = 130;
        value.height = 82;
        value.fontSize = 74;
      }
    }
    if (compositionId === "join-qr-code") {
      const card = byId.get("qr-card");
      if (card && card.width === 240 && card.height === 280) {
        card.width = 260;
        card.height = 300;
        card.fillColor = "#fffdf4";
      }
      const placeholder = byId.get("qr-placeholder");
      if (placeholder && placeholder.width === 162 && placeholder.height === 162) {
        placeholder.y = 124;
        placeholder.width = 212;
        placeholder.height = 212;
        placeholder.fillColor = "#fffdf4";
      }
      const label = byId.get("qr-label");
      if (label && label.fontSize === 24 && label.autoFitText === true) {
        label.y = 248;
        label.width = 220;
        label.height = 24;
        label.fontSize = 20;
      }
    }
  }

  function migrateRemovedWidgetComponents(compositionId, components = []) {
    const removedByComposition = {
      "join-qr-code": new Set(["qr-url"])
    };
    const removedIds = removedByComposition[compositionId];
    if (!removedIds?.size) return;
    for (let index = components.length - 1; index >= 0; index -= 1) {
      if (removedIds.has(components[index]?.id)) components.splice(index, 1);
    }
  }

  function migrateGeneratedWidgetLayerOrder(compositionId, components = []) {
    const preferredOrders = {
      "stage-code-panel": ["panel-code", "panel-label", "panel-card"],
      "stage-code-widget": ["badge-code", "badge-label", "badge-card"],
      "join-widget": ["join-text", "join-pill"],
      "waiting-status-widget": ["status-text", "status-pill"],
      "countdown-popup": ["popup-text", "popup-card"],
      "crafting-timer-widget": ["timer-value", "timer-ring"],
      "join-qr-code": ["qr-label", "qr-placeholder", "qr-card"]
    };
    const preferredOrder = preferredOrders[compositionId];
    if (!preferredOrder?.length) return;
    const componentIds = components.map((component) => component.id);
    const generatedIds = new Set(preferredOrder);
    const onlyGenerated = componentIds.every((id) => generatedIds.has(id));
    const hasEveryGeneratedId = preferredOrder.every((id) => componentIds.includes(id));
    if (!onlyGenerated || !hasEveryGeneratedId) return;
    const byId = new Map(components.map((component) => [component.id, component]));
    components.splice(0, components.length, ...preferredOrder.map((id) => byId.get(id)));
  }

  function publicArtComposition(composition, manifest) {
    return normalizeComposition(composition, manifest.compositions?.[composition.id] || null);
  }

  function deletedCompositionIds(manifest) {
    return new Set(Array.isArray(manifest.deletedCompositionIds)
      ? manifest.deletedCompositionIds.map(cleanId).filter(Boolean)
      : []);
  }

  function customArtCompositionDefinitions(manifest) {
    const definitions = [];
    const manifestCompositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    const deletedIds = deletedCompositionIds(manifest);
    for (const [compositionId, composition] of Object.entries(manifestCompositions)) {
      const id = cleanId(compositionId);
      if (!id || knownCompositionIds.has(id) || deletedIds.has(id)) continue;
      definitions.push({
        id,
        name: cleanText(composition?.name, "Art Asset"),
        description: cleanText(composition?.description, "Editable art asset.", 240),
        surface: normalizeCompositionSurface(composition?.surface),
        isCustom: true,
        canvas: composition?.canvas || { width: 560, height: 230 },
        components: []
      });
    }
    return definitions;
  }

  function allPublicArtCompositions(manifest) {
    const deletedIds = deletedCompositionIds(manifest);
    const compositions = [
      ...artCompositions.filter((composition) => !deletedIds.has(composition.id)).map((composition) => publicArtComposition(composition, manifest)),
      ...customArtCompositionDefinitions(manifest).map((composition) => publicArtComposition(composition, manifest))
    ];
    if (!Array.isArray(localDraftStore?.artCompositions)) return compositions;
    const byId = new Map(compositions.map((composition) => [composition.id, composition]));
    for (const composition of localDraftStore.artCompositions) {
      if (!composition?.id || deletedIds.has(composition.id)) continue;
      byId.set(composition.id, composition);
    }
    return [...byId.values()];
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
      compositions: allPublicArtCompositions(manifest),
      organization: normalizeArtOrganization(manifest.organization)
    });
  }

  async function handleSaveArtOrganization(req, res) {
    let payload;
    try {
      payload = await readJson(req, 1024 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }
    const manifest = await loadArtManifest();
    manifest.organization = normalizeArtOrganization(payload.organization || payload);
    const savedManifest = await saveArtManifest(manifest);
    onArtAssetsChanged({ type: "organization", updatedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true, organization: normalizeArtOrganization(savedManifest.organization) });
  }

  function normalizeArtCompositionsDraft(source = []) {
    if (!Array.isArray(source)) throw new Error("Art composition draft must be an array");
    return source.map((incoming) => {
      const safeCompositionId = cleanId(incoming?.id);
      if (!safeCompositionId) throw new Error("Art composition draft contains an invalid id");
      const definition = artCompositions.find((item) => item.id === safeCompositionId) || {
        id: safeCompositionId,
        name: cleanText(incoming?.name, "Art Asset"),
        description: cleanText(incoming?.description, "Editable art asset.", 240),
        surface: normalizeCompositionSurface(incoming?.surface),
        isCustom: true,
        canvas: incoming?.canvas || { width: 560, height: 230 },
        components: []
      };
      return normalizeComposition(definition, incoming);
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
      surface: normalizeCompositionSurface(incoming?.surface || savedDefinition?.surface),
      isCustom: true,
      canvas: incoming?.canvas || savedDefinition?.canvas || { width: 560, height: 230 },
      components: []
    };
    const normalized = normalizeComposition(definition, incoming);
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    manifest.deletedCompositionIds = Array.isArray(manifest.deletedCompositionIds)
      ? manifest.deletedCompositionIds.filter((id) => cleanId(id) !== definition.id)
      : [];
    manifest.compositions[definition.id] = {
      name: normalized.name,
      description: normalized.description,
      surface: normalized.surface,
      isCustom: normalized.isCustom,
      canvas: normalized.canvas,
      components: normalized.components,
      updatedAt: new Date().toISOString()
    };
    const savedManifest = await saveArtManifest(manifest);
    onArtAssetsChanged({ type: "composition", id: definition.id, updatedAt: savedManifest.compositions?.[definition.id]?.updatedAt || manifest.compositions[definition.id].updatedAt });
    sendJson(res, 200, { ok: true, composition: publicArtComposition(definition, savedManifest) });
  }

  async function handleDeleteArtComposition(req, res, compositionId) {
    const safeCompositionId = cleanId(compositionId);
    if (!safeCompositionId || safeCompositionId !== String(compositionId || "").toLowerCase()) {
      sendJson(res, 400, { ok: false, error: "Invalid art composition id" });
      return;
    }

    const manifest = await loadArtManifest();
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    delete manifest.compositions[safeCompositionId];
    const deletedIds = deletedCompositionIds(manifest);
    if (knownCompositionIds.has(safeCompositionId)) deletedIds.add(safeCompositionId);
    manifest.deletedCompositionIds = [...deletedIds];
    const savedManifest = await saveArtManifest(manifest);
    onArtAssetsChanged({ type: "composition-delete", id: safeCompositionId, updatedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true, compositions: allPublicArtCompositions(savedManifest) });
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
    handleDeleteArtComposition,
    handleSaveArtOrganization,
    handleSaveArtComposition,
    handleReplaceArtAsset,
    normalizeArtCompositionsDraft,
    normalizeArtOrganization,
    publicArtAsset,
    publicArtComposition,
    readArtManifest,
    sendArtAssetList,
    serveArtFile
  };
}

module.exports = { createArtAssetsRuntime };
