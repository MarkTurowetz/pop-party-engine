import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { normalizeTimeline } from "../../../shared/timeline-model";
import {
  componentKindLabel,
  componentSupportsImageMask,
  normalizeContainerDistribution,
  normalizeFillCss,
  normalizeGameTextFontFamily,
  normalizeImageObjectFit,
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
  const supportsImage = componentSupportsImageMask(raw);
  const isTextual = kind === "text" || kind === "badge";
  const serialized = {
    id: String(component.id || ""),
    name: String(component.name || componentKindLabel(kind)),
    instanceLabel: String(component.instanceLabel || ""),
    kind,
    x: num(component.x, 0),
    y: num(component.y, 0),
    width: num(component.width, 1),
    height: num(component.height, 1),
    scale: num(component.scale, 1),
    rotation: num(component.rotation, 0),
    opacity: num(component.opacity, 1),
    visible: component.visible !== false,
    locked: component.locked === true,
    defaultAnimationState: String(component.defaultAnimationState || ""),
    childDistribution: kind === "container" ? normalizeContainerDistribution(component.childDistribution) : "none",
    defaultText: String(component.defaultText || ""),
    fontSize: num(component.fontSize, 16),
    autoFitText: isTextual ? component.autoFitText !== false : false,
    fontColor: String(component.fontColor || "#17131f"),
    fontFamily: isTextual ? normalizeGameTextFontFamily(component.fontFamily) : "",
    shapeStyle: normalizeShapeStyle(component.shapeStyle, kind),
    fillColor: String(component.fillColor || "transparent"),
    fillCss: normalizeFillCss(component.fillCss),
    borderColor: String(component.borderColor || "transparent"),
    borderWidth: num(component.borderWidth, 0),
    borderRadius: num(component.borderRadius, 0),
    imageDataUrl: supportsImage ? String(component.imageDataUrl || "") : "",
    imageAssetId: supportsImage ? String(component.imageAssetId || "") : "",
    imageName: supportsImage ? String(component.imageName || "") : "",
    imageMimeType: supportsImage ? String(component.imageMimeType || "") : "",
    imageObjectFit: supportsImage ? normalizeImageObjectFit(component.imageObjectFit) : "cover",
    imageTint: supportsImage ? String(component.imageTint || "") : "",
    artCompositionId: kind === "reference" ? String(component.artCompositionId || "") : "",
    children: (Array.isArray(component.children) ? component.children : []).map((child) =>
      serializeArtComponentForSave(child as ArtComponent)
    )
  } as ArtComponent;
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
