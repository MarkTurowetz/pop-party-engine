import type {
  ArtComposition,
  ControllerLayoutLayer,
  LayoutElement,
  LayoutState,
  StageLayoutCollection
} from "../../types/game-data";
import { normalizeGameTextFontFamily } from "../../textFonts";
import { normalizeLayoutTags } from "./layoutTags";

/**
 * Typed port of the legacy serializeStageLayoutsForSave / serializeLayoutGroup so
 * the React layout editor saves byte-compatibly. `mode` selects the canvas fallback
 * (stage 1920x1080, controller 390x844).
 */
export type LayoutMode = "stage" | "controller";

export function normalizeLayoutAuthoringId(value: unknown, fallback = ""): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

export function uniqueLayoutAuthoringId(
  value: unknown,
  usedIds: Iterable<string>,
  fallback: string
): string {
  const used = new Set([...usedIds].map((id) => normalizeLayoutAuthoringId(id)));
  const base = normalizeLayoutAuthoringId(value, fallback);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (true) {
    const suffixText = `-${suffix}`;
    const candidate = `${base.slice(0, Math.max(1, 48 - suffixText.length))}${suffixText}`;
    if (!used.has(candidate)) return candidate;
    suffix += 1;
  }
}

export function layoutGameObjectCompositions(
  compositions: ArtComposition[],
  mode: LayoutMode
): ArtComposition[] {
  return compositions
    .filter((composition) => {
      const surface = String(composition.surface || "")
        .trim()
        .toLowerCase();
      const kind = String(composition.compositionKind || "gameObject")
        .trim()
        .toLowerCase();
      return surface === mode && kind === "gameobject";
    })
    .sort((left, right) =>
      String(left.name || left.id).localeCompare(String(right.name || right.id), undefined, {
        sensitivity: "base"
      })
    );
}

function num(value: unknown, fallback = 0): number {
  const n = Number((value as number) ?? fallback);
  return Number(Number(Number.isFinite(n) ? n : fallback).toFixed(3));
}

function normalizeColor(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function controllerInitialAnimationState(value: unknown): "On" | "Off" {
  const state = String(value || "")
    .trim()
    .toLowerCase();
  return ["off", "park", "disappear", "hidden", "hide"].includes(state) ? "Off" : "On";
}

function serializeElement(raw: LayoutElement, mode: LayoutMode): LayoutElement {
  const element = raw as Record<string, unknown>;
  const kind = String(element.kind || "art");
  const artCompositionId = String(element.artCompositionId || "");
  const isText = kind === "text" || artCompositionId === "layout-text-field";
  const serialized = {
    id: String(element.id || ""),
    name: String(element.name || ""),
    selector: String(element.selector || ""),
    kind,
    artCompositionId,
    layoutLayer:
      mode === "stage" && String(element.layoutLayer || "").toLowerCase() === "background"
        ? "background"
        : "content",
    hidden: element.hidden === true,
    locked: element.locked === true,
    x: num(element.x, 0),
    y: num(element.y, 0),
    width: num(element.width, 0),
    height: num(element.height, 0),
    scale: num(element.scale, 1),
    rotation: num(element.rotation, 0),
    tags: normalizeLayoutTags(element.tags),
    defaultAnimationState:
      mode === "controller"
        ? controllerInitialAnimationState(element.defaultAnimationState)
        : String(element.defaultAnimationState || ""),
    defaultText: isText ? String(element.defaultText ?? "") : "",
    fontSize: isText ? num(element.fontSize, 58) : 58,
    autoFitText: isText ? element.autoFitText === true : false,
    fontFamily: isText ? normalizeGameTextFontFamily(element.fontFamily) : "",
    fontColor: isText ? normalizeColor(element.fontColor) || "#ffffff" : "#ffffff"
  } as LayoutElement;
  if (kind === "collection") {
    serialized.collectionDirection = element.collectionDirection === "horizontal" ? "horizontal" : "vertical";
    serialized.collectionGap = num(element.collectionGap, 16);
    serialized.collectionDistribution = ["start", "center", "end", "space-between", "space-around", "space-evenly"]
      .includes(String(element.collectionDistribution))
      ? element.collectionDistribution as LayoutElement["collectionDistribution"]
      : "start";
    serialized.collectionAlignment = ["start", "center", "end", "stretch"].includes(String(element.collectionAlignment))
      ? element.collectionAlignment as LayoutElement["collectionAlignment"]
      : "stretch";
    serialized.collectionPadding = num(element.collectionPadding, 0);
    serialized.collectionOverflow = ["visible", "hidden", "auto", "scroll"].includes(String(element.collectionOverflow))
      ? element.collectionOverflow as LayoutElement["collectionOverflow"]
      : "auto";
    serialized.zIndex = num(element.zIndex, 0);
  }
  return serialized;
}

function serializeGroup(raw: LayoutState, mode: LayoutMode): LayoutState {
  const group = raw as Record<string, unknown>;
  return {
    id: String(group.id || ""),
    name: String(group.name || ""),
    hiddenInStates: group.id === "global" ? group.hiddenInStates === true : false,
    hiddenGlobals: Array.isArray(group.hiddenGlobals) ? [...group.hiddenGlobals] : [],
    hiddenLayers: Array.isArray(group.hiddenLayers) ? [...group.hiddenLayers] : [],
    elements: (Array.isArray(group.elements) ? group.elements : []).map((element) =>
      serializeElement(element as LayoutElement, mode)
    )
  } as LayoutState;
}

export function serializeLayoutsForSave(
  layouts: Partial<StageLayoutCollection> | null | undefined,
  mode: LayoutMode
): StageLayoutCollection {
  const fallbackCanvas =
    mode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
  const canvas = (layouts?.canvas || {}) as { width?: number; height?: number };
  const result = {
    canvas: {
      width: Number(canvas.width || fallbackCanvas.width),
      height: Number(canvas.height || fallbackCanvas.height)
    },
    global: serializeGroup(
      (layouts?.global as LayoutState) || { id: "global", name: "Global Layout", elements: [] },
      mode
    ),
    states: (layouts?.states || []).map((state) => serializeGroup(state as LayoutState, mode)),
    ...(mode === "controller" ? {
      layers: ((layouts?.layers || []) as ControllerLayoutLayer[]).map((layer, index) => ({
        ...serializeGroup(layer, mode),
        zIndex: Number.isFinite(Number(layer.zIndex)) ? Number(layer.zIndex) : (index + 1) * 100
      }))
    } : {})
  } as StageLayoutCollection;
  return result;
}

export function layoutSnapshot(
  layouts: Partial<StageLayoutCollection> | null | undefined,
  mode: LayoutMode
): string {
  return JSON.stringify(serializeLayoutsForSave(layouts, mode));
}

/** All authorable groups for a layout collection. */
export function layoutGroups(layouts: StageLayoutCollection | null | undefined): LayoutState[] {
  if (!layouts) return [];
  return [layouts.global, ...(layouts.layers || []), ...(layouts.states || [])].filter(Boolean) as LayoutState[];
}
