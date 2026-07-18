import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { normalizeTimeline } from "../../../shared/timeline-model";
import {
  componentKindLabel,
  componentSupportsShapeStyle,
  componentSupportsSpriteSource,
  normalizeContainerDistribution,
  normalizeFillCss,
  normalizeGameTextFontFamily,
  normalizeImageObjectFit,
  normalizeSpriteRenderMode,
  normalizeTransformOrigin,
  normalizeShapeStyle
} from "./artComponentSchema";
import { mergeDefaultArtVisibilityTimeline, normalizeAnimationKeyframePropsForEditing } from "./artTimelineModel";

/**
 * Typed port of serializeArtCompositionsForSave / serializeArtComponentForSave so
 * the React composition editor saves byte-compatibly with the legacy art tool.
 */
export type ArtCompositionKind = "gameObject" | "prefab";

export const artCompositionKindOptions = [
  { value: "gameObject", label: "Game Object" },
  { value: "prefab", label: "Prefab" }
] as const;

function num(value: unknown, fallback = 0, precision = 3): number {
  const n = Number((value as number) ?? fallback);
  return Number(Number(Number.isFinite(n) ? n : fallback).toFixed(precision));
}

export function normalizeArtCompositionSurface(surface: unknown): string {
  return surface === "controller" ? "controller" : "stage";
}

export function normalizeArtCompositionKind(value: unknown, fallback: ArtCompositionKind = "gameObject"): ArtCompositionKind {
  return value === "prefab" ? "prefab" : fallback;
}

export function artCompositionKindLabel(value: unknown): string {
  const kind = normalizeArtCompositionKind(value);
  return artCompositionKindOptions.find((option) => option.value === kind)?.label || "Game Object";
}

export function serializeArtComponentForSave(raw: ArtComponent): ArtComponent {
  const component = raw as Record<string, unknown>;
  const kind = String(component.kind || "shape");
  const supportsImage = componentSupportsSpriteSource(raw);
  const supportsShape = componentSupportsShapeStyle(raw);
  const isTextual = kind === "text" || kind === "badge";
  const isReference = kind === "reference";
  const serialized = {
    id: String(component.id || ""),
    name: String(component.name || componentKindLabel(kind)),
    instanceLabel: String(component.instanceLabel || ""),
    kind,
    x: num(component.x, 0),
    y: num(component.y, 0),
    ...(isReference ? {} : { width: num(component.width, 1), height: num(component.height, 1) }),
    scale: num(component.scale, 1),
    rotation: num(component.rotation, 0),
    opacity: num(component.opacity, 1),
    brightness: num(component.brightness, 1),
    visible: component.visible !== false,
    editorHidden: component.editorHidden === true,
    transformOrigin: normalizeTransformOrigin(component.transformOrigin),
    locked: component.locked === true,
    defaultAnimationState: String(component.defaultAnimationState || ""),
    childDistribution: kind === "container" ? normalizeContainerDistribution(component.childDistribution) : "none",
    defaultText: String(component.defaultText || ""),
    fontSize: num(component.fontSize, 16),
    autoFitText: isTextual ? component.autoFitText !== false : false,
    fontColor: String(component.fontColor || "#17131f"),
    fontFamily: isTextual ? normalizeGameTextFontFamily(component.fontFamily) : "",
    artCompositionId: isReference ? String(component.artCompositionId || "") : "",
    referenceSizeMode: isReference ? "intrinsic" : "",
    children: (Array.isArray(component.children) ? component.children : []).map((child) =>
      serializeArtComponentForSave(child as ArtComponent)
    )
  } as ArtComponent;
  const output = serialized as Record<string, unknown>;
  if (!isReference) delete output.referenceSizeMode;
  if (supportsShape) {
    output.shapeStyle = normalizeShapeStyle(component.shapeStyle, kind);
    output.fillColor = String(component.fillColor || "transparent");
    output.fillCss = normalizeFillCss(component.fillCss);
    output.borderColor = String(component.borderColor || "transparent");
    output.borderWidth = num(component.borderWidth, 0);
    output.borderRadius = num(component.borderRadius, 0);
  }
  if (supportsImage) {
    output.imageDataUrl = String(component.imageDataUrl || "");
    output.imageAssetId = String(component.imageAssetId || "");
    output.imageName = String(component.imageName || "");
    output.imageMimeType = String(component.imageMimeType || "");
    output.imageObjectFit = normalizeImageObjectFit(component.imageObjectFit);
    output.imageTint = String(component.imageTint || "currentColor");
    output.spriteRenderMode = normalizeSpriteRenderMode(component.spriteRenderMode);
  }
  return serialized;
}

export function serializeArtCompositionForSave(raw: ArtComposition): ArtComposition {
  const composition = raw as Record<string, unknown>;
  const canvas = (composition.canvas || {}) as Record<string, unknown>;
  const timeline = normalizeTimeline(composition.timeline);
  const serialized = {
    id: String(composition.id || ""),
    name: String(composition.name || "Art Asset"),
    description: String(composition.description || ""),
    surface: normalizeArtCompositionSurface(composition.surface),
    compositionKind: normalizeArtCompositionKind(composition.compositionKind),
    isCustom: Boolean(composition.isCustom),
    timelineArchitectureVersion: Number(composition.timelineArchitectureVersion || 0),
    canvas: { width: Number(canvas.width || 1), height: Number(canvas.height || 1) },
    components: (Array.isArray(composition.components) ? composition.components : []).map((component) =>
      serializeArtComponentForSave(component as ArtComponent)
    )
  } as ArtComposition;
  if (timeline) serialized.timeline = timeline as ArtComposition["timeline"];
  return serialized;
}

export function serializeArtCompositionsForSave(source: ArtComposition[] | null | undefined): ArtComposition[] {
  return (source || []).map(serializeArtCompositionForSave);
}

export function hydrateArtComponentForEditing(raw: ArtComponent): ArtComponent {
  const component = raw as Record<string, unknown>;
  const hydrated = {
    ...(JSON.parse(JSON.stringify(raw || {})) as ArtComponent),
    children: (Array.isArray(component.children) ? component.children : []).map((child) =>
      hydrateArtComponentForEditing(child as ArtComponent)
    )
  };
  if (hydrated.kind === "reference" && hydrated.referenceSizeMode === "intrinsic") {
    delete hydrated.width;
    delete hydrated.height;
  }
  delete (hydrated as Record<string, unknown>).timeline;
  return hydrated;
}

export function hydrateArtCompositionForEditing(raw: ArtComposition): ArtComposition {
  const composition = JSON.parse(JSON.stringify(raw || {})) as ArtComposition;
  const components = (Array.isArray(composition.components) ? composition.components : []).map(hydrateArtComponentForEditing);
  const rootComponent = {
    id: composition.id || "composition",
    name: composition.name || "Composition",
    kind: "container",
    x: 0,
    y: 0,
    width: Number(composition.canvas?.width || 1),
    height: Number(composition.canvas?.height || 1),
    children: components
  } as ArtComponent;
  return {
    ...composition,
    timeline: normalizeAnimationKeyframePropsForEditing(
      mergeDefaultArtVisibilityTimeline(normalizeTimeline(composition.timeline) as ArtComposition["timeline"]),
      rootComponent
    ),
    components
  };
}

export function hydrateArtCompositionsForEditing(source: ArtComposition[] | null | undefined): ArtComposition[] {
  return (source || []).map(hydrateArtCompositionForEditing);
}

/** Per-composition snapshot for dirty tracking (matches the legacy save shape). */
export function artCompositionSnapshot(composition: ArtComposition): string {
  return JSON.stringify(serializeArtCompositionForSave(composition));
}
