const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const artComponentSchema = require("../shared/art-component-schema");
const {
  ART_COMPONENT_SCHEMA_VERSION,
  migrateLegacyArtCompositionSchema,
  migrateLegacyArtManifestSchema,
  normalizeCurrentArtManifestGeometry
} = require("../shared/art-component-schema-migration");
const { normalizeColor } = require("../shared/color-utils");
const { normalizeTimeline } = require("../shared/timeline-model");
const { ART_TIMELINE_ARCHITECTURE_VERSION, collectArtArchitectureIssues } = require("../shared/art-timeline-architecture");
const { canonicalLifecycleLabel } = require("../shared/lifecycle-labels");
const {
  migrateLayoutTextFieldWidgetComponents,
  migrateLayoutTextFieldWidgetKind,
  migrateLayoutTextFieldWidgetTimeline
} = require("../shared/layout-text-art");
const {
  legacyLobbyWidgetChildOverride,
  lobbyWidgetChildIdForParent,
  migrateLobbyWidgetComponents,
  migrateLobbyWidgetKind,
  migrateLobbyWidgetName,
  migrateLobbyWidgetReferenceBounds,
  migrateLobbyWidgetTimeline
} = require("../shared/lobby-widget-art");
const { controllerButtonOverride } = require("../shared/controller-button-art");
const { controllerPlayerBannerOverride } = require("./controller-player-banner-art-runtime");
const { playerWidgetPointPopupAnchorOverride } = require("./player-widget-point-popup-anchor-runtime");
const { compositionRevision, createArtCompositionDependencyReport } = require("./art-composition-dependency-runtime");

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
  loadArtDependencySources = null,
  localDraftStore = null,
  manifestFile,
  onArtAssetsChanged = () => {},
  readJson,
  sendJson,
  writeArtManifestSource = null
}) {
  artCompositions = artCompositions.map((composition) => migrateLegacyArtCompositionSchema(JSON.parse(JSON.stringify(composition))));
  const knownCompositionIds = new Set(artCompositions.map((composition) => composition.id));

  function manifestRevision(manifest) {
    return crypto.createHash("sha256").update(JSON.stringify(manifest || {})).digest("hex");
  }

  function revisionMatches(payload, manifest) {
    const expected = cleanText(payload?.revision, "", 128);
    return !expected || expected === manifestRevision(manifest);
  }

  function readArtManifest() {
    try {
      return migrateLegacyArtManifestSchema(JSON.parse(fs.readFileSync(manifestFile, "utf8"))).manifest;
    } catch (error) {
      return {};
    }
  }

  function writeArtManifest(manifest) {
    fs.mkdirSync(artRoot, { recursive: true });
    fs.mkdirSync(customDir, { recursive: true });
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    const tempFile = `${manifestFile}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(tempFile, "w", 0o600);
    try {
      fs.writeFileSync(fd, body);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempFile, manifestFile);
  }

  async function loadArtManifest() {
    if (typeof loadArtManifestSource === "function") {
      const manifest = await loadArtManifestSource();
      const source = manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {};
      return migrateLegacyArtManifestSchema(source).manifest;
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

  function cleanSpriteTint(value, fallback = "currentColor") {
    const text = String(value ?? "").trim();
    if (text === "currentColor") return text;
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

  function normalizeOrganizationKey(value, folderIds = new Set()) {
    const text = String(value || "").trim().toLowerCase();
    const itemKey = normalizeOrganizationItemKey(text);
    if (itemKey) return itemKey;
    if (!text.startsWith("folder:")) return "";
    const folderId = cleanId(text.slice(7));
    return folderId && folderIds.has(folderId) ? `folder:${folderId}` : "";
  }

  function folderContainsFolder(folderItems, folderId, descendantId, visited = new Set()) {
    if (!folderId || !descendantId || visited.has(folderId)) return false;
    visited.add(folderId);
    for (const key of folderItems[folderId] || []) {
      if (!String(key).startsWith("folder:")) continue;
      const childId = String(key).slice(7);
      if (childId === descendantId || folderContainsFolder(folderItems, childId, descendantId, visited)) return true;
    }
    return false;
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
        const key = normalizeOrganizationKey(rawKey, folderIds);
        if (!key || seenOrder.has(key)) continue;
        order.push(key);
        seenOrder.add(key);
      }
      const folderItems = {};
      const incomingFolderItems = incoming.folderItems && typeof incoming.folderItems === "object" ? incoming.folderItems : {};
      for (const folderId of folderIds) {
        const items = [];
        const seenItems = new Set();
        for (const rawKey of Array.isArray(incomingFolderItems[folderId]) ? incomingFolderItems[folderId] : []) {
          const key = normalizeOrganizationKey(rawKey, folderIds);
          if (!key || seenItems.has(key)) continue;
          if (key === `folder:${folderId}`) continue;
          items.push(key);
          seenItems.add(key);
        }
        folderItems[folderId] = items;
      }
      for (const folderId of folderIds) {
        folderItems[folderId] = (folderItems[folderId] || []).filter((key) => {
          if (!String(key).startsWith("folder:")) return true;
          return !folderContainsFolder(folderItems, String(key).slice(7), folderId);
        });
      }
      const assignedKeys = new Set();
      for (const folderId of folderIds) {
        const uniqueItems = [];
        for (const key of folderItems[folderId] || []) {
          if (assignedKeys.has(key)) continue;
          assignedKeys.add(key);
          uniqueItems.push(key);
        }
        folderItems[folderId] = uniqueItems;
      }
      for (let index = order.length - 1; index >= 0; index -= 1) {
        if (assignedKeys.has(order[index])) order.splice(index, 1);
      }
      for (const folderId of folderIds) {
        const key = `folder:${folderId}`;
        if (!assignedKeys.has(key) && !order.includes(key)) order.push(key);
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
      if (!artAssets.some((asset) => asset.id === imageAssetId)) return null;
      return {
        imageAssetId,
        imageName: cleanImageName(source.imageName, base.imageName || imageAssetId),
        imageMimeType: "",
        imageObjectFit: artComponentSchema.normalizeImageObjectFit(source.imageObjectFit || base.imageObjectFit),
        imageTint: cleanSpriteTint(source.imageTint, base.imageTint || "currentColor")
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
      imageTint: cleanSpriteTint(source.imageTint, base.imageTint || "currentColor")
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
      instanceLabel: cleanText(source.instanceLabel, base.instanceLabel || "", 80),
      kind,
      x: cleanNumber(source.x, Number(base.x || 0)),
      y: cleanNumber(source.y, Number(base.y || 0)),
      width: cleanNumber(source.width, Number(base.width || 1), 1),
      height: cleanNumber(source.height, Number(base.height || 1), 1),
      scale: cleanNumber(source.scale, Number(base.scale || 1), 0.05, 8),
      rotation: cleanNumber(source.rotation, Number(base.rotation || 0), -3600, 3600),
      opacity: cleanNumber(source.opacity, Number(base.opacity ?? 1), 0, 1),
      brightness: cleanNumber(source.brightness, Number(base.brightness ?? 1), 0, 4),
      visible: typeof source.visible === "boolean" ? source.visible : base.visible !== false,
      editorHidden: typeof source.editorHidden === "boolean" ? source.editorHidden : base.editorHidden === true,
      transformOrigin: artComponentSchema.normalizeTransformOrigin(source.transformOrigin || base.transformOrigin),
      locked: typeof source.locked === "boolean" ? source.locked : base.locked === true,
      defaultAnimationState: canonicalLifecycleLabel(cleanText(source.defaultAnimationState, base.defaultAnimationState || "", 24))
        || cleanText(source.defaultAnimationState, base.defaultAnimationState || "", 24)
    };
    if (kind === "reference") {
      normalized.artCompositionId = cleanId(source.artCompositionId, base.artCompositionId || "");
      normalized.referenceSizeMode = source.referenceSizeMode === "intrinsic" || base.referenceSizeMode === "intrinsic"
        ? "intrinsic"
        : "legacy";
      if (normalized.referenceSizeMode === "intrinsic") {
        delete normalized.width;
        delete normalized.height;
      }
    }
    if (kind === "container") {
      normalized.childDistribution = artComponentSchema.normalizeContainerDistribution(source.childDistribution || base.childDistribution);
    }
    if (kind === "text" || kind === "badge") {
      normalized.defaultText = cleanText(source.defaultText, base.defaultText || "", 500);
      normalized.fontSize = cleanNumber(source.fontSize, Number(base.fontSize || 16), 6, 240);
      normalized.autoFitText = typeof source.autoFitText === "boolean"
        ? source.autoFitText
        : base.autoFitText !== false;
      normalized.fontColor = cleanColor(source.fontColor, base.fontColor || "#17131f");
      normalized.fontFamily = artComponentSchema.normalizeTextFontFamily(source.fontFamily, base.fontFamily);
    }
    if (kind === "shape" || kind === "container" || kind === "badge") {
      normalized.shapeStyle = artComponentSchema.normalizeShapeStyle(source.shapeStyle || base.shapeStyle, kind);
      normalized.fillColor = cleanColor(source.fillColor, base.fillColor || "transparent");
      normalized.fillCss = artComponentSchema.normalizeFillCss(source.fillCss || base.fillCss);
      normalized.borderColor = cleanColor(source.borderColor, base.borderColor || "transparent");
      normalized.borderWidth = cleanNumber(source.borderWidth, Number(base.borderWidth || 0), 0, 80);
      normalized.borderRadius = cleanNumber(source.borderRadius, Number(base.borderRadius || 0), 0, 999);
    }
    if (artComponentSchema.componentSupportsSpriteSource(kind)) {
      const imageMask = normalizeComponentImageMask(source, base);
      if (imageMask) Object.assign(normalized, imageMask);
      normalized.spriteRenderMode = artComponentSchema.normalizeSpriteRenderMode(source.spriteRenderMode || base.spriteRenderMode);
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
    if (override) migrateLegacyArtCompositionSchema(override);
    const components = normalizeCompositionComponents(composition.components || [], override?.components);
    migrateGeneratedStageCodePanelDefaults(composition.id, components);
    migrateGeneratedWidgetDefaults(composition.id, components);
    migrateRemovedWidgetComponents(composition.id, components);
    migrateGeneratedWidgetLayerOrder(composition.id, components);
    migrateVotingCardVoterContainerDefaults(composition.id, components);
    migratePlayerAnswerBubbleLayerOrder(composition.id, components);
    migrateLayoutTextFieldWidgetComponents(composition.id, components);
    migrateLobbyWidgetComponents(composition.id, components);
    const canvas = {
      width: cleanNumber(override?.canvas?.width, Number(composition.canvas?.width || 1), 1),
      height: cleanNumber(override?.canvas?.height, Number(composition.canvas?.height || 1), 1)
    };
    migrateGeneratedWidgetCanvas(composition.id, canvas);
    migratePlayerObjectCanvas(composition.id, canvas);
    migrateLobbyWidgetReferenceBounds(composition.id, components, canvas);
    let timelineOverride = migrateLayoutTextFieldWidgetTimeline(composition.id, override?.timeline, composition.timeline);
    timelineOverride = migrateLobbyWidgetTimeline(composition.id, timelineOverride, composition.timeline);
    const timeline = normalizeTimeline(timelineOverride, composition.timeline);
    const normalized = {
      id: composition.id,
      name: cleanText(
        migrateLobbyWidgetName(composition.id, override?.name || composition.name),
        composition.name || "Art Asset"
      ),
      description: cleanText(override?.description, composition.description || "Editable art asset.", 240),
      surface: normalizeCompositionSurface(override?.surface || composition.surface),
      compositionKind: normalizeCompositionKind(
        migrateLobbyWidgetKind(
          composition.id,
          migrateLayoutTextFieldWidgetKind(composition.id, override?.compositionKind || composition.compositionKind)
        )
      ),
      isCustom: Boolean(composition.isCustom || override?.isCustom),
      timelineArchitectureVersion: cleanNumber(
        override?.timelineArchitectureVersion,
        Number(composition.timelineArchitectureVersion || 0),
        0,
        ART_TIMELINE_ARCHITECTURE_VERSION
      ),
      canvas,
      components,
      updatedAt: override?.updatedAt || null
    };
    if (timeline) normalized.timeline = timeline;
    return normalized;
  }

  function migrateVotingCardVoterContainerDefaults(compositionId, components) {
    if (compositionId !== "voting-card" || !Array.isArray(components)) return;
    const voterContainer = components.find((component) => component?.id === "voter-container");
    if (!voterContainer || voterContainer.childDistribution === "vertical") return;
    voterContainer.childDistribution = "horizontal";
  }

  function migratePlayerAnswerBubbleLayerOrder(compositionId, components = []) {
    if (compositionId !== "player-answer-bubble") return;
    const legacyOrder = ["answer-bubble-tail", "answer-bubble-card", "answer-text"];
    const componentIds = components.map((component) => component.id);
    if (componentIds.length !== legacyOrder.length) return;
    if (!legacyOrder.every((id, index) => componentIds[index] === id)) return;
    const byId = new Map(components.map((component) => [component.id, component]));
    components.splice(0, components.length, byId.get("answer-text"), byId.get("answer-bubble-card"), byId.get("answer-bubble-tail"));
  }

  function normalizeCompositionSurface(surface) {
    return surface === "controller" ? "controller" : "stage";
  }

  function normalizeCompositionKind(kind) {
    return kind === "prefab" ? "prefab" : "gameObject";
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
    if ((compositionId === "crafting-timer-widget" || compositionId === "crafting-timer")
      && canvas.width === 190 && canvas.height === 190) {
      canvas.width = 180;
      canvas.height = 180;
    }
  }

  function migratePlayerObjectCanvas(compositionId, canvas = {}) {
    if (!String(compositionId || "").startsWith("player-object-")) return;
    if (Number(canvas.height || 0) < 370) canvas.height = 370;
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
    if (compositionId === "crafting-timer") {
      const fill = byId.get("timer-fill");
      if (fill && !fill.instanceLabel) fill.instanceLabel = "timerFill";
      const background = byId.get("timer-background");
      if (background && !background.instanceLabel) background.instanceLabel = "timerBackground";
      const value = byId.get("timer-value");
      if (value && !value.instanceLabel) value.instanceLabel = "timerValue";
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
      "crafting-timer": ["timer-value", "timer-background", "timer-fill"],
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
    const explicitOverride = controllerButtonOverride(composition, manifest.compositions || {})
      || controllerPlayerBannerOverride(composition, manifest.compositions || {})
      || playerWidgetPointPopupAnchorOverride(composition, manifest.compositions || {});
    const migratedChildOverride = explicitOverride
      ? null
      : legacyLobbyWidgetChildOverride(composition.id, manifest.compositions || {});
    return normalizeComposition(composition, explicitOverride || migratedChildOverride);
  }

  function artCompositionManifestRecord(composition, updatedAt = null) {
    return {
      name: composition.name,
      description: composition.description,
      surface: composition.surface,
      compositionKind: composition.compositionKind,
      isCustom: composition.isCustom,
      timelineArchitectureVersion: composition.timelineArchitectureVersion,
      canvas: composition.canvas,
      components: composition.components,
      ...(composition.timeline ? { timeline: composition.timeline } : {}),
      updatedAt: updatedAt || composition.updatedAt || new Date().toISOString()
    };
  }

  function materializeLegacyLobbyWidgetChild(manifest, parentCompositionId) {
    const childId = lobbyWidgetChildIdForParent(parentCompositionId);
    if (!childId) return;
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    if (manifest.compositions[childId]) return;
    const derivedOverride = legacyLobbyWidgetChildOverride(childId, manifest.compositions);
    const childDefinition = artCompositions.find((composition) => composition.id === childId);
    if (!derivedOverride || !childDefinition) return;
    const normalizedChild = normalizeComposition(childDefinition, derivedOverride);
    manifest.compositions[childId] = artCompositionManifestRecord(normalizedChild, derivedOverride.updatedAt);
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
        compositionKind: normalizeCompositionKind(composition?.compositionKind),
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

  function compositionSaveConflict(payload, manifest, compositionIds = []) {
    if (revisionMatches(payload, manifest)) return null;
    const expected = payload?.expectedCompositionRevisions && typeof payload.expectedCompositionRevisions === "object"
      ? payload.expectedCompositionRevisions
      : null;
    const currentById = new Map(allPublicArtCompositions(manifest).map((composition) => [composition.id, composition]));
    const currentRevisions = Object.fromEntries(compositionIds.map((id) => {
      const current = currentById.get(id);
      return [id, current ? compositionRevision(current) : ""];
    }));
    const conflicts = compositionIds.filter((id) =>
      !expected || !Object.prototype.hasOwnProperty.call(expected, id) || String(expected[id] || "") !== currentRevisions[id]
    );
    if (!conflicts.length) return null;
    return {
      ok: false,
      error: conflicts.length === 1
        ? "Art composition changed; reload before saving"
        : "Art compositions changed; reload before saving",
      conflictCompositionIds: conflicts,
      compositionRevisions: currentRevisions,
      revision: manifestRevision(manifest)
    };
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
      hasCustom,
      fileName: hasCustom ? customFile : asset.defaultFile,
      updatedAt: hasCustom ? custom.updatedAt : null
    };
    const draftReplacement = localDraftStore?.artAssetReplacements?.[asset.id] || null;
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

  async function sendArtAssetList(res) {
    const manifest = await loadArtManifest();
    const compositions = allPublicArtCompositions(manifest);
    const dependencySources = typeof loadArtDependencySources === "function" ? await loadArtDependencySources() : {};
    const dependencyReport = createArtCompositionDependencyReport({ compositions, ...dependencySources });
    sendJson(res, 200, {
      ok: true,
      groups: artGroups,
      assets: artAssets.map((asset) => publicArtAsset(asset, manifest)),
      compositions,
      ...dependencyReport,
      organization: normalizeArtOrganization(localDraftStore?.artOrganization || manifest.organization),
      revision: manifestRevision(manifest)
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
    if (!revisionMatches(payload, manifest)) {
      sendJson(res, 409, { ok: false, error: "Art manifest changed; reload before saving", revision: manifestRevision(manifest) });
      return;
    }
    manifest.organization = normalizeArtOrganization(payload.organization || payload);
    const savedManifest = await saveArtManifest(manifest);
    if (localDraftStore) localDraftStore.artOrganization = null;
    onArtAssetsChanged({ type: "organization", updatedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true, organization: normalizeArtOrganization(savedManifest.organization), revision: manifestRevision(savedManifest) });
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
        compositionKind: normalizeCompositionKind(incoming?.compositionKind),
        isCustom: true,
        canvas: incoming?.canvas || { width: 560, height: 230 },
        components: []
      };
      return normalizeComposition(definition, incoming);
    });
  }

  function normalizeArtAssetReplacementsDraft(source = {}) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("Art asset replacement draft must be an object");
    }
    const replacements = {};
    for (const [assetId, replacement] of Object.entries(source)) {
      const asset = artAssets.find((item) => item.id === assetId);
      if (!asset) throw new Error(`Unknown art asset id: ${assetId}`);
      const dataUrl = String(replacement?.dataUrl || "");
      const mimeType = String(replacement?.mimeType || "");
      const fileName = path.basename(String(replacement?.fileName || "replacement"));
      const match = dataUrl.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
      if (!match || match[1] !== mimeType || !acceptedArtTypes[mimeType]) {
        throw new Error("Use a PNG, SVG, JPG, or WEBP file");
      }
      const originalExt = path.extname(fileName).toLowerCase();
      const expectedExt = acceptedArtTypes[mimeType];
      const ext = originalExt === ".jpeg" ? ".jpg" : originalExt;
      if (ext && ext !== expectedExt) {
        throw new Error(`Selected file does not match ${mimeType}`);
      }
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        throw new Error("Replacement art must be under 5 MB");
      }
      replacements[asset.id] = {
        fileName: cleanImageName(fileName, "replacement"),
        mimeType,
        dataUrl,
        updatedAt: cleanText(replacement?.updatedAt, new Date().toISOString(), 40) || new Date().toISOString()
      };
    }
    return replacements;
  }

  function architectureIssueKey(issue) {
    return [issue?.compositionId, issue?.code, issue?.message].map((value) => String(value || "")).join("\u0000");
  }

  function blockingArtArchitectureIssues(beforeCompositions, afterCompositions, touchedCompositionIds = []) {
    const previousIssueKeys = new Set(collectArtArchitectureIssues(beforeCompositions).map(architectureIssueKey));
    const touchedIds = new Set([...touchedCompositionIds].map(cleanId).filter(Boolean));
    return collectArtArchitectureIssues(afterCompositions).filter((issue) =>
      touchedIds.has(cleanId(issue?.compositionId)) || !previousIssueKeys.has(architectureIssueKey(issue))
    );
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
    const saveConflict = compositionSaveConflict(payload, manifest, [safeCompositionId]);
    if (saveConflict) {
      sendJson(res, 409, saveConflict);
      return;
    }
    const previousCompositions = allPublicArtCompositions(manifest);
    const incoming = payload.composition || payload;
    const savedDefinition = manifest.compositions?.[safeCompositionId] || null;
    const definition = artCompositions.find((item) => item.id === safeCompositionId) || {
      id: safeCompositionId,
      name: cleanText(incoming?.name, savedDefinition?.name || "Art Asset"),
      description: cleanText(incoming?.description, savedDefinition?.description || "Editable art asset.", 240),
      surface: normalizeCompositionSurface(incoming?.surface || savedDefinition?.surface),
      compositionKind: normalizeCompositionKind(incoming?.compositionKind || savedDefinition?.compositionKind),
      isCustom: true,
      canvas: incoming?.canvas || savedDefinition?.canvas || { width: 560, height: 230 },
      components: []
    };
    const normalized = normalizeComposition(definition, incoming);
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    materializeLegacyLobbyWidgetChild(manifest, definition.id);
    manifest.deletedCompositionIds = Array.isArray(manifest.deletedCompositionIds)
      ? manifest.deletedCompositionIds.filter((id) => cleanId(id) !== definition.id)
      : [];
    manifest.compositions[definition.id] = artCompositionManifestRecord(normalized);
    manifest.artComponentSchemaVersion = ART_COMPONENT_SCHEMA_VERSION;
    const geometryManifest = normalizeCurrentArtManifestGeometry(manifest).manifest;
    const validationIssues = blockingArtArchitectureIssues(
      previousCompositions,
      allPublicArtCompositions(geometryManifest),
      [definition.id]
    );
    if (validationIssues.length) {
      sendJson(res, 409, { ok: false, error: "Art composition validation failed", issues: validationIssues });
      return;
    }
    const savedManifest = await saveArtManifest(geometryManifest);
    if (Array.isArray(localDraftStore?.artCompositions)) {
      localDraftStore.artCompositions = localDraftStore.artCompositions.filter((composition) => composition?.id !== definition.id);
      if (!localDraftStore.artCompositions.length) localDraftStore.artCompositions = null;
    }
    onArtAssetsChanged({ type: "composition", id: definition.id, updatedAt: savedManifest.compositions?.[definition.id]?.updatedAt || manifest.compositions[definition.id].updatedAt });
    const savedComposition = publicArtComposition(definition, savedManifest);
    sendJson(res, 200, {
      ok: true,
      composition: savedComposition,
      compositionRevisions: { [savedComposition.id]: compositionRevision(savedComposition) },
      revision: manifestRevision(savedManifest)
    });
  }

  async function handleSaveArtCompositions(req, res) {
    let payload;
    try {
      payload = await readJson(req, 32 * 1024 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }
    if (!Array.isArray(payload.compositions) || !payload.compositions.length) {
      sendJson(res, 400, { ok: false, error: "Art compositions are required" });
      return;
    }
    const manifest = await loadArtManifest();
    const requestedIds = payload.compositions.map((composition) => cleanId(composition?.id)).filter(Boolean);
    const saveConflict = compositionSaveConflict(payload, manifest, requestedIds);
    if (saveConflict) {
      sendJson(res, 409, saveConflict);
      return;
    }
    const previousCompositions = allPublicArtCompositions(manifest);
    let normalized;
    try {
      normalized = normalizeArtCompositionsDraft(payload.compositions);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
      return;
    }
    const candidate = JSON.parse(JSON.stringify(manifest));
    candidate.compositions = candidate.compositions && typeof candidate.compositions === "object" ? candidate.compositions : {};
    const updatedAt = new Date().toISOString();
    for (const composition of normalized) {
      materializeLegacyLobbyWidgetChild(candidate, composition.id);
      candidate.deletedCompositionIds = Array.isArray(candidate.deletedCompositionIds)
        ? candidate.deletedCompositionIds.filter((id) => cleanId(id) !== composition.id)
        : [];
      candidate.compositions[composition.id] = artCompositionManifestRecord(composition, updatedAt);
    }
    candidate.artComponentSchemaVersion = ART_COMPONENT_SCHEMA_VERSION;
    const geometryCandidate = normalizeCurrentArtManifestGeometry(candidate).manifest;
    const validationIssues = blockingArtArchitectureIssues(
      previousCompositions,
      allPublicArtCompositions(geometryCandidate),
      normalized.map((composition) => composition.id)
    );
    if (validationIssues.length) {
      sendJson(res, 409, { ok: false, error: "Art composition validation failed", issues: validationIssues });
      return;
    }
    const savedManifest = await saveArtManifest(geometryCandidate);
    if (Array.isArray(localDraftStore?.artCompositions)) {
      const savedIds = new Set(normalized.map((composition) => composition.id));
      localDraftStore.artCompositions = localDraftStore.artCompositions.filter((composition) => !savedIds.has(composition?.id));
      if (!localDraftStore.artCompositions.length) localDraftStore.artCompositions = null;
    }
    onArtAssetsChanged({ type: "composition-batch", ids: normalized.map((composition) => composition.id), updatedAt });
    const savedCompositions = normalized.map((composition) => publicArtComposition(composition, savedManifest));
    sendJson(res, 200, {
      ok: true,
      compositions: savedCompositions,
      compositionRevisions: Object.fromEntries(savedCompositions.map((composition) => [composition.id, compositionRevision(composition)])),
      revision: manifestRevision(savedManifest)
    });
  }

  async function handleDeleteArtComposition(req, res, compositionId) {
    const safeCompositionId = cleanId(compositionId);
    if (!safeCompositionId || safeCompositionId !== String(compositionId || "").toLowerCase()) {
      sendJson(res, 400, { ok: false, error: "Invalid art composition id" });
      return;
    }

    const manifest = await loadArtManifest();
    const requestUrl = new URL(req.url || "", "http://localhost");
    const revision = requestUrl.searchParams.get("revision") || "";
    if (revision && revision !== manifestRevision(manifest)) {
      sendJson(res, 409, { ok: false, error: "Art manifest changed; reload before deleting", revision: manifestRevision(manifest) });
      return;
    }
    manifest.compositions = manifest.compositions && typeof manifest.compositions === "object" ? manifest.compositions : {};
    delete manifest.compositions[safeCompositionId];
    const deletedIds = deletedCompositionIds(manifest);
    if (knownCompositionIds.has(safeCompositionId)) deletedIds.add(safeCompositionId);
    manifest.deletedCompositionIds = [...deletedIds];
    const savedManifest = await saveArtManifest(manifest);
    if (Array.isArray(localDraftStore?.artCompositions)) {
      localDraftStore.artCompositions = localDraftStore.artCompositions.filter((composition) => composition?.id !== safeCompositionId);
      if (!localDraftStore.artCompositions.length) localDraftStore.artCompositions = null;
    }
    onArtAssetsChanged({ type: "composition-delete", id: safeCompositionId, updatedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true, compositions: allPublicArtCompositions(savedManifest), revision: manifestRevision(savedManifest) });
  }

  function removeDeletedCompositionOrganizationKeys(organization, deletedIds) {
    const deletedKeys = new Set([...deletedIds].map((id) => `composition:${id}`));
    const next = JSON.parse(JSON.stringify(organization || {}));
    for (const surface of ["stage", "controller"]) {
      const source = next[surface] || {};
      source.order = (source.order || []).filter((key) => !deletedKeys.has(String(key)));
      source.folderItems = Object.fromEntries(Object.entries(source.folderItems || {}).map(([folderId, keys]) => [
        folderId,
        (Array.isArray(keys) ? keys : []).filter((key) => !deletedKeys.has(String(key)))
      ]));
      next[surface] = source;
    }
    return normalizeArtOrganization(next);
  }

  async function handleCleanupArtCompositions(req, res) {
    let payload;
    try {
      payload = await readJson(req, 4 * 1024 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }
    const requestedIds = Array.isArray(payload.deleteCompositionIds)
      ? [...new Set(payload.deleteCompositionIds.map(cleanId).filter(Boolean))]
      : [];
    if (!requestedIds.length) {
      sendJson(res, 400, { ok: false, error: "At least one composition is required" });
      return;
    }

    const manifest = await loadArtManifest();
    const currentCompositions = allPublicArtCompositions(manifest);
    const currentById = new Map(currentCompositions.map((composition) => [composition.id, composition]));
    const dependencySources = typeof loadArtDependencySources === "function" ? await loadArtDependencySources() : {};
    const currentReport = createArtCompositionDependencyReport({ compositions: currentCompositions, ...dependencySources });
    const expectedRevisions = payload.expectedCompositionRevisions && typeof payload.expectedCompositionRevisions === "object"
      ? payload.expectedCompositionRevisions
      : {};
    const requestedRevision = cleanText(payload.revision, "", 128);
    if (requestedRevision && requestedRevision !== manifestRevision(manifest)) {
      const conflicts = requestedIds.filter((id) => currentById.has(id) && expectedRevisions[id] !== currentReport.compositionRevisions[id]);
      if (conflicts.length) {
        sendJson(res, 409, {
          ok: false,
          error: "Some trashed assets changed elsewhere. Review them before deleting.",
          conflictingCompositionIds: conflicts,
          revision: manifestRevision(manifest),
          compositions: currentCompositions,
          ...currentReport
        });
        return;
      }
    }

    const deleting = new Set(requestedIds);
    const blockingDependencies = requestedIds.flatMap((id) => {
      const summary = currentReport.dependencies[id];
      return (summary?.details || []).filter((detail) => detail.kind !== "art" || !deleting.has(cleanId(detail.sourceCompositionId)));
    });
    if (blockingDependencies.length) {
      sendJson(res, 409, {
        ok: false,
        error: "One or more trashed assets are still referenced.",
        blockingDependencies,
        revision: manifestRevision(manifest),
        ...currentReport
      });
      return;
    }

    const candidate = JSON.parse(JSON.stringify(manifest));
    candidate.compositions = candidate.compositions && typeof candidate.compositions === "object" ? candidate.compositions : {};
    const deletedIds = deletedCompositionIds(candidate);
    for (const id of requestedIds) {
      delete candidate.compositions[id];
      if (knownCompositionIds.has(id)) deletedIds.add(id);
    }
    candidate.deletedCompositionIds = [...deletedIds];
    candidate.organization = removeDeletedCompositionOrganizationKeys(candidate.organization, deleting);
    candidate.artComponentSchemaVersion = ART_COMPONENT_SCHEMA_VERSION;
    const remainingCompositions = allPublicArtCompositions(candidate);
    const validationIssues = blockingArtArchitectureIssues(currentCompositions, remainingCompositions);
    if (validationIssues.length) {
      sendJson(res, 409, { ok: false, error: "Art composition validation failed", issues: validationIssues });
      return;
    }
    const savedManifest = await saveArtManifest(candidate);
    if (Array.isArray(localDraftStore?.artCompositions)) {
      localDraftStore.artCompositions = localDraftStore.artCompositions.filter((composition) => !deleting.has(composition?.id));
      if (!localDraftStore.artCompositions.length) localDraftStore.artCompositions = null;
    }
    const savedCompositions = allPublicArtCompositions(savedManifest);
    const savedReport = createArtCompositionDependencyReport({ compositions: savedCompositions, ...dependencySources });
    onArtAssetsChanged({ type: "composition-cleanup", ids: requestedIds, updatedAt: new Date().toISOString() });
    sendJson(res, 200, {
      ok: true,
      compositions: savedCompositions,
      organization: normalizeArtOrganization(savedManifest.organization),
      revision: manifestRevision(savedManifest),
      ...savedReport
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
    const manifest = await loadArtManifest();
    if (!revisionMatches(payload, manifest)) {
      sendJson(res, 409, { ok: false, error: "Art manifest changed; reload before saving", revision: manifestRevision(manifest) });
      return;
    }
    const previousFile = manifest[asset.id]?.fileName;
    const savedFileName = `${asset.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${expectedExt}`;
    const savedFilePath = path.join(customDir, savedFileName);
    const stagedFilePath = `${savedFilePath}.tmp`;
    fs.writeFileSync(stagedFilePath, buffer, { mode: 0o600 });
    fs.renameSync(stagedFilePath, savedFilePath);
    const updatedAt = new Date().toISOString();
    manifest[asset.id] = {
      fileName: savedFileName,
      sourceName: fileName,
      mimeType,
      updatedAt
    };
    let savedManifest;
    try {
      savedManifest = await saveArtManifest(manifest);
    } catch (error) {
      try { fs.unlinkSync(savedFilePath); } catch (cleanupError) { /* Best-effort rollback of a staged replacement. */ }
      throw error;
    }
    if (previousFile && previousFile !== savedFileName) {
      const previousPath = path.join(customDir, path.basename(previousFile));
      try { if (fs.existsSync(previousPath)) fs.unlinkSync(previousPath); } catch (error) { /* Stale inactive files are harmless. */ }
    }
    if (localDraftStore?.artAssetReplacements) {
      delete localDraftStore.artAssetReplacements[asset.id];
      if (!Object.keys(localDraftStore.artAssetReplacements).length) localDraftStore.artAssetReplacements = null;
    }
    onArtAssetsChanged({ type: "asset", id: asset.id, updatedAt });
    sendJson(res, 200, { ok: true, asset: publicArtAsset(asset, savedManifest), revision: manifestRevision(savedManifest) });
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
    handleCleanupArtCompositions,
    handleDeleteArtComposition,
    handleSaveArtOrganization,
    handleSaveArtComposition,
    handleSaveArtCompositions,
    handleReplaceArtAsset,
    normalizeArtAssetReplacementsDraft,
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
