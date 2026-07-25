// Typed port of the legacy client/stage/widget-art-renderer.js IIFE. Installs
// window.PartyGameStageWidgetArt for the legacy stage runtime. PartyGame* deps +
// visualAnimation are read lazily via globalThis at call time.

import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import type { TimelineDocument } from "../../shared/timeline-model";

type Dict = Record<string, unknown>;
type El = HTMLElement;

declare global {
  interface Window {
    PartyGameStageWidgetArt?: typeof PartyGameStageWidgetArt;
    visualAnimation?: unknown;
  }
}

const w = () => globalThis as typeof globalThis & Window;

interface TreeRenderer {
  render: (components: Dict[], canvas: Dict, options: Dict) => void;
  playAll?: (animation: string, options?: Dict) => number;
}

export interface ArtComponentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function artComponentBoundsInComposition(
  composition: Dict | null,
  componentId: string,
  getComposition: (id: string) => Dict | null
): ArtComponentBounds | null {
  if (!composition || !componentId) return null;
  const rootCanvas = (composition.canvas as Dict) || { width: 1, height: 1 };
  const rootRegion = {
    left: 0,
    top: 0,
    width: Math.max(1, Number(rootCanvas.width || 1)),
    height: Math.max(1, Number(rootCanvas.height || 1))
  };

  const visit = (current: Dict, region: typeof rootRegion, referencePath: Set<string>): ArtComponentBounds | null => {
    const canvas = (current.canvas as Dict) || { width: 1, height: 1 };
    const canvasWidth = Math.max(1, Number(canvas.width || 1));
    const canvasHeight = Math.max(1, Number(canvas.height || 1));
    for (const component of (current.components as Dict[]) || []) {
      const referencedId = component.kind === "reference" ? String(component.artCompositionId || "") : "";
      const referenced = referencedId && !referencePath.has(referencedId)
        ? getComposition(referencedId)
        : null;
      const referencedCanvas = (referenced?.canvas as Dict) || {};
      const scale = Number.isFinite(Number(component.scale)) ? Number(component.scale) : 1;
      const sourceWidth = referenced
        ? Math.max(1, Number(referencedCanvas.width || 1))
        : Math.max(1, Number(component.width || 1));
      const sourceHeight = referenced
        ? Math.max(1, Number(referencedCanvas.height || 1))
        : Math.max(1, Number(component.height || 1));
      const width = (sourceWidth / canvasWidth) * region.width * scale;
      const height = (sourceHeight / canvasHeight) * region.height * scale;
      const x = region.left + (Number(component.x || 0) / canvasWidth) * region.width;
      const y = region.top + (Number(component.y || 0) / canvasHeight) * region.height;
      if (component.id === componentId) return { x, y, width, height };
      if (Array.isArray(component.children) && component.children.length) {
        const nestedChild = visit({ ...current, components: component.children }, region, referencePath);
        if (nestedChild) return nestedChild;
      }
      if (!referenced) continue;
      const nextPath = new Set(referencePath);
      nextPath.add(referencedId);
      const nested = visit(referenced, { left: x - width / 2, top: y - height / 2, width, height }, nextPath);
      if (nested) return nested;
    }
    return null;
  };

  return visit(composition, rootRegion, new Set([String(composition.id || "")]));
}

function createRenderer(options: Dict = {}) {
  const documentRef = (options.document as Document) || globalThis.document;
  const visualAnimation = options.visualAnimation || w().visualAnimation;
  const getComposition = typeof options.getComposition === "function" ? (options.getComposition as (id: string) => Dict | null) : () => null;
  const renderers = new Map<string, TreeRenderer>();
  const textOverridesByRenderer = new Map<string, Dict>();
  const anonymousHostKeys = new WeakMap<El, string>();
  let anonymousHostCounter = 0;

  function rendererKey(host: El | null, compositionId: string): string {
    let hostKey = host?.id || "";
    if (!hostKey && host) {
      hostKey = anonymousHostKeys.get(host) || `stage-widget-${++anonymousHostCounter}`;
      anonymousHostKeys.set(host, hostKey);
    }
    return `${hostKey || "stage-widget"}:${compositionId}`;
  }

  function widgetLayer(host: El | null): El | null {
    if (!host) return null;
    let layer = Array.from(host.children).find((child) => child.classList?.contains("stage-widget-art-layer")) as El | undefined;
    if (!layer) {
      layer = documentRef.createElement("div");
      layer.className = "stage-widget-art-layer";
      host.prepend(layer);
    }
    return layer;
  }

  function hideLegacyWidgetContent(host: El | null, keepElements: El[] = []): void {
    const textNodeType = Node?.TEXT_NODE || 3;
    const elementNodeType = Node?.ELEMENT_NODE || 1;
    const keep = new Set((keepElements || []).filter(Boolean));
    for (const element of keep) {
      element.hidden = false;
      delete element.dataset.stageWidgetLegacyHidden;
    }
    for (const node of Array.from(host?.childNodes || [])) {
      if (node === widgetLayer(host)) continue;
      if (keep.has(node as El)) continue;
      if (node.nodeType === textNodeType && String(node.nodeValue || "").trim()) {
        node.nodeValue = "";
      }
      if (node.nodeType === elementNodeType) {
        (node as El).hidden = true;
        (node as El).dataset.stageWidgetLegacyHidden = "true";
      }
    }
  }

  function cloneComponent(component: Dict, textOverrides: Dict = {}): Dict {
    const clone: Dict = {
      ...component,
      children: ((component.children as Dict[]) || []).map((child) => cloneComponent(child, textOverrides))
    };
    const kind = w().PartyGameArtComponentSchema?.normalizeComponentKind?.(clone.kind as string) || clone.kind;
    if ((kind === "text" || kind === "badge") && Object.prototype.hasOwnProperty.call(textOverrides, clone.id as string)) {
      clone.defaultText = String(textOverrides[clone.id as string] ?? "");
    }
    return clone;
  }

  function renderResult(host: El | null, compositionId: string, textOverrides: Dict = {}, renderOptions: Dict = {}): { composition: Dict; renderer: TreeRenderer } | null {
    const composition = getComposition(compositionId);
    const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer } | undefined;
    if (!host || !composition || !artRuntime) return null;
    host.classList.add("stage-widget-art-host", "has-stage-widget-art");
    const layer = widgetLayer(host);
    if (!layer) return null;
    hideLegacyWidgetContent(host, (renderOptions.keepElements as El[]) || []);
    const key = rendererKey(host, compositionId);
    textOverridesByRenderer.set(key, textOverrides);
    let renderer = renderers.get(key);
    if (!renderer && artRuntime.ArtObjectTreeRenderer) {
      renderer = new artRuntime.ArtObjectTreeRenderer({
        host: layer,
        document: documentRef,
        instanceId: `widget:${key}`,
        gameObjectApi: w().PartyGameGameObject || w().PartyGameStageGameObject,
        visualAnimation,
        getComposition: (id: string) => {
          const referenced = getComposition(id);
          if (!referenced) return null;
          const activeOverrides = textOverridesByRenderer.get(key) || {};
          return {
            ...referenced,
            components: ((referenced.components as Dict[]) || []).map((component) => cloneComponent(component, activeOverrides))
          };
        }
      });
      renderers.set(key, renderer);
    }
    if (!renderer) return null;
    const components = ((composition.components as Dict[]) || []).map((component) => cloneComponent(component, textOverrides));
    renderer.render(components, (composition.canvas as Dict) || { width: 1, height: 1 }, {
      instant: renderOptions.instant !== false,
      timeline: effectiveVisibilityTimeline(composition.timeline as TimelineDocument | null | undefined)
    });
    return { composition, renderer };
  }

  function render(host: El | null, compositionId: string, textOverrides: Dict = {}, renderOptions: Dict = {}): Dict | null {
    return renderResult(host, compositionId, textOverrides, renderOptions)?.composition || null;
  }

  function positionOverlay(host: El | null, composition: Dict | null, componentId: string, overlay: El | null): void {
    const bounds = artComponentBoundsInComposition(composition, componentId, getComposition);
    if (!host || !composition || !bounds || !overlay) return;
    const canvas = (composition!.canvas as Dict) || { width: 1, height: 1 };
    overlay.classList.add("stage-widget-art-overlay");
    overlay.style.left = `${(bounds.x / Math.max(1, Number(canvas.width || 1))) * 100}%`;
    overlay.style.top = `${(bounds.y / Math.max(1, Number(canvas.height || 1))) * 100}%`;
    overlay.style.width = `${(bounds.width / Math.max(1, Number(canvas.width || 1))) * 100}%`;
    overlay.style.height = `${(bounds.height / Math.max(1, Number(canvas.height || 1))) * 100}%`;
    overlay.style.transform = "translate(-50%, -50%)";
  }

  function renderBound(host: El | null, binding: Dict = {}, context: Dict = {}): { composition: Dict; renderer: TreeRenderer } | null {
    const textOverrides =
      typeof binding.textOverrides === "function" ? (binding.textOverrides as (c: Dict) => Dict)(context) : (binding.textOverrides as Dict) || {};
    const overlayElements = ((binding.overlays as Dict[]) || [])
      .map((overlay) => (typeof overlay.element === "function" ? (overlay.element as (c: Dict) => El)(context) : (overlay.element as El)))
      .filter(Boolean);
    const result = renderResult(host, binding.compositionId as string, textOverrides, {
      ...((binding.options as Dict) || {}),
      keepElements: overlayElements
    });
    for (const overlay of (binding.overlays as Dict[]) || []) {
      const element = typeof overlay.element === "function" ? (overlay.element as (c: Dict) => El)(context) : (overlay.element as El);
      positionOverlay(host, result?.composition || null, overlay.componentId as string, element);
    }
    return result;
  }

  return { render, renderBound, positionOverlay };
}

export const PartyGameStageWidgetArt = { createRenderer };

export function installStageWidgetArtGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageWidgetArt = PartyGameStageWidgetArt;
}

installStageWidgetArtGlobals(typeof window !== "undefined" ? window : globalThis);
