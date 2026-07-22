"use strict";

const path = require("path");
const artComponentSchema = require("../shared/art-component-schema");
const { normalizeColor } = require("../shared/color-utils");
const { canonicalLifecycleLabel } = require("../shared/lifecycle-labels");

function createArtComponentNormalizationRuntime({ acceptedArtTypes = {}, artAssets = [] } = {}) {
  const artAssetIds = new Set(artAssets.map((asset) => asset.id));

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

  function cleanImageName(value, fallback = "Uploaded image") {
    return cleanText(path.basename(String(value || fallback)), fallback, 180);
  }

  function normalizeComponentImageMask(source = {}, base = {}) {
    const imageAssetId = cleanId(source.imageAssetId, base.imageAssetId || "");
    const dataUrl = String(source.imageDataUrl || base.imageDataUrl || "").trim();
    if (!dataUrl) {
      if (!imageAssetId || !artAssetIds.has(imageAssetId)) return null;
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
    const kind = artComponentSchema.normalizeComponentKind(source.kind || base.kind, "shape");
    const id = cleanId(base.id || source.id);
    if (!id) return null;
    const normalized = {
      id,
      name: cleanText(source.name, base.name || artComponentSchema.componentKindLabel(kind)),
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
      normalized.referenceSizeMode = source.referenceSizeMode === "intrinsic" || base.referenceSizeMode === "intrinsic" ? "intrinsic" : "legacy";
      if (normalized.referenceSizeMode === "intrinsic") {
        delete normalized.width;
        delete normalized.height;
      }
    }
    if (kind === "container") normalized.childDistribution = artComponentSchema.normalizeContainerDistribution(source.childDistribution || base.childDistribution);
    if (kind === "text" || kind === "badge") {
      normalized.defaultText = cleanText(source.defaultText, base.defaultText || "", 500);
      normalized.fontSize = cleanNumber(source.fontSize, Number(base.fontSize || 16), 6, 240);
      normalized.autoFitText = typeof source.autoFitText === "boolean" ? source.autoFitText : base.autoFitText !== false;
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
    const sourceChildren = Array.isArray(source.children) ? source.children : Array.isArray(base.children) ? base.children : [];
    const children = [];
    const seenChildren = new Set();
    for (const child of sourceChildren) {
      const childId = cleanId(child?.id);
      const normalizedChild = normalizeComponent(child, fallbackChildren.get(childId) || {});
      if (normalizedChild && !seenChildren.has(normalizedChild.id)) {
        children.push(normalizedChild);
        seenChildren.add(normalizedChild.id);
      }
    }
    if (children.length) normalized.children = children;
    return normalized;
  }

  return Object.freeze({ cleanId, cleanNumber, cleanText, normalizeComponent });
}

module.exports = Object.freeze({ createArtComponentNormalizationRuntime });
