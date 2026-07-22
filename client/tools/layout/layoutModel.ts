import type { LayoutElement, LayoutState, StageLayoutCollection } from "../../types/game-data";
import { normalizeGameTextFontFamily } from "../../textFonts";
import { normalizeLayoutTags } from "./layoutTags";

/**
 * Typed port of the legacy serializeStageLayoutsForSave / serializeLayoutGroup so
 * the React layout editor saves byte-compatibly. `mode` selects the canvas fallback
 * (stage 1920x1080, controller 390x844).
 */
export type LayoutMode = "stage" | "controller";

function num(value: unknown, fallback = 0): number {
  const n = Number((value as number) ?? fallback);
  return Number(Number(Number.isFinite(n) ? n : fallback).toFixed(3));
}

function normalizeColor(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function controllerInitialAnimationState(value: unknown): "On" | "Off" {
  const state = String(value || "").trim().toLowerCase();
  return ["off", "park", "disappear", "hidden", "hide"].includes(state) ? "Off" : "On";
}

function serializeElement(raw: LayoutElement, mode: LayoutMode): LayoutElement {
  const element = raw as Record<string, unknown>;
  const kind = String(element.kind || "art");
  const artCompositionId = String(element.artCompositionId || "");
  const isText = kind === "text" || artCompositionId === "layout-text-field";
  return {
    id: String(element.id || ""),
    name: String(element.name || ""),
    selector: String(element.selector || ""),
    kind,
    artCompositionId,
    layoutLayer: mode === "stage" && String(element.layoutLayer || "").toLowerCase() === "background" ? "background" : "content",
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
}

function serializeGroup(raw: LayoutState, mode: LayoutMode): LayoutState {
  const group = raw as Record<string, unknown>;
  return {
    id: String(group.id || ""),
    name: String(group.name || ""),
    hiddenInStates: group.id === "global" ? group.hiddenInStates === true : false,
    hiddenGlobals: Array.isArray(group.hiddenGlobals) ? [...group.hiddenGlobals] : [],
    elements: (Array.isArray(group.elements) ? group.elements : []).map((element) =>
      serializeElement(element as LayoutElement, mode)
    )
  } as LayoutState;
}

export function serializeLayoutsForSave(
  layouts: Partial<StageLayoutCollection> | null | undefined,
  mode: LayoutMode
): StageLayoutCollection {
  const fallbackCanvas = mode === "controller" ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
  const canvas = (layouts?.canvas || {}) as { width?: number; height?: number };
  return {
    canvas: {
      width: Number(canvas.width || fallbackCanvas.width),
      height: Number(canvas.height || fallbackCanvas.height)
    },
    global: serializeGroup((layouts?.global as LayoutState) || { id: "global", name: "Global Layout", elements: [] }, mode),
    states: (layouts?.states || []).map((state) => serializeGroup(state as LayoutState, mode))
  } as StageLayoutCollection;
}

export function layoutSnapshot(layouts: Partial<StageLayoutCollection> | null | undefined, mode: LayoutMode): string {
  return JSON.stringify(serializeLayoutsForSave(layouts, mode));
}

/** All groups (global + states) for a layout collection. */
export function layoutGroups(layouts: StageLayoutCollection | null | undefined): LayoutState[] {
  if (!layouts) return [];
  return [layouts.global, ...(layouts.states || [])].filter(Boolean) as LayoutState[];
}
