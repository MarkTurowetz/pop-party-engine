import type { ArtComponent } from "../../types/game-data";
import type { TimelineDocument, TimelineProperties } from "../../../shared/timeline-model";
import { addTransformKeyframe, effectiveArtVisibilityTimeline } from "./artTimelineModel";

export interface ArtCanvasTransformTarget {
  component: ArtComponent;
  id: string;
  originX: number;
  originY: number;
  parentScale: number;
  parentRotation: number;
  resolvedProps: TimelineProperties;
}

export interface ArtCanvasTransformPatch {
  target: ArtCanvasTransformTarget;
  patch: TimelineProperties;
}

export type ArtCanvasLivePositions = Record<string, { x: number; y: number }>;

export type ArtCanvasArrowDirection = "left" | "right" | "up" | "down";

export interface ArtCanvasKeyboardCommand {
  direction: ArtCanvasArrowDirection;
  mode: "align" | "nudge";
  step: number;
}

export interface ArtCanvasVisualBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function artCanvasKeyboardCommand(event: {
  altKey?: boolean;
  ctrlKey?: boolean;
  getModifierState?: (key: "Fn") => boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
}): ArtCanvasKeyboardCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const arrowDirections: Record<string, ArtCanvasArrowDirection> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down"
  };
  const functionArrowDirections: Record<string, ArtCanvasArrowDirection> = {
    Home: "left",
    End: "right",
    PageUp: "up",
    PageDown: "down"
  };
  const direction = arrowDirections[event.key] || functionArrowDirections[event.key];
  if (!direction) return null;
  const functionModified = Boolean(event.getModifierState?.("Fn")) || Object.prototype.hasOwnProperty.call(functionArrowDirections, event.key);
  if (event.shiftKey && functionModified) return { direction, mode: "align", step: 0 };
  if (!arrowDirections[event.key]) return null;
  return { direction, mode: "nudge", step: event.shiftKey ? 10 : 1 };
}

export function rootArtCanvasSelectionIds(components: ArtComponent[], selectedIds: ReadonlySet<string>): Set<string> {
  const roots = new Set<string>();
  const visit = (items: ArtComponent[], ancestorSelected: boolean): void => {
    for (const component of items || []) {
      const selected = selectedIds.has(component.id);
      if (selected && !ancestorSelected) roots.add(component.id);
      visit(component.children || [], ancestorSelected || selected);
    }
  };
  visit(components, false);
  return roots;
}

export function artCanvasDragSelection(
  currentSelection: ReadonlySet<string>,
  anchorId: string,
  additive: boolean
): Set<string> {
  if (currentSelection.has(anchorId)) return new Set(currentSelection);
  return additive ? new Set([...currentSelection, anchorId]) : new Set([anchorId]);
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function resolvedNumber(component: ArtComponent, props: TimelineProperties, key: keyof ArtComponent, fallback: number): number {
  return finiteNumber(Object.prototype.hasOwnProperty.call(props, key) ? props[String(key)] : component[key], fallback);
}

export function captureArtCanvasTransformTargets(
  components: ArtComponent[],
  targetIds: ReadonlySet<string>,
  resolveProps: (component: ArtComponent) => TimelineProperties
): ArtCanvasTransformTarget[] {
  const targets: ArtCanvasTransformTarget[] = [];
  const visit = (items: ArtComponent[], parentScale: number, parentRotation: number): void => {
    for (const component of items || []) {
      const resolvedProps = resolveProps(component);
      if (targetIds.has(component.id) && component.locked !== true) {
        targets.push({
          component,
          id: component.id,
          originX: resolvedNumber(component, resolvedProps, "x", 0),
          originY: resolvedNumber(component, resolvedProps, "y", 0),
          parentScale,
          parentRotation,
          resolvedProps
        });
      }
      const scale = resolvedNumber(component, resolvedProps, "scale", 1);
      const rotation = resolvedNumber(component, resolvedProps, "rotation", 0);
      if (component.children?.length) {
        visit(component.children, parentScale * scale, parentRotation + rotation);
      }
    }
  };
  visit(components, 1, 0);
  return targets;
}

export function translatedArtCanvasPositions(
  targets: ArtCanvasTransformTarget[],
  worldDeltaX: number,
  worldDeltaY: number
): ArtCanvasLivePositions {
  return Object.fromEntries(
    targets.map((target) => {
      const scale = Math.max(0.001, Math.abs(target.parentScale));
      const radians = (target.parentRotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const localDeltaX = (worldDeltaX * cos + worldDeltaY * sin) / scale;
      const localDeltaY = (-worldDeltaX * sin + worldDeltaY * cos) / scale;
      return [
        target.id,
        {
          x: Number((target.originX + localDeltaX).toFixed(3)),
          y: Number((target.originY + localDeltaY).toFixed(3))
        }
      ];
    })
  );
}

export function alignedArtCanvasPositions(
  targets: ArtCanvasTransformTarget[],
  visualBoundsById: ReadonlyMap<string, ArtCanvasVisualBounds>,
  direction: ArtCanvasArrowDirection,
  previewScale: number
): ArtCanvasLivePositions {
  if (targets.length < 2 || previewScale <= 0) return {};
  const edge = direction === "left" || direction === "right" ? direction : direction === "up" ? "top" : "bottom";
  const entries = targets
    .map((target) => ({ target, bounds: visualBoundsById.get(target.id) }))
    .filter((entry): entry is { target: ArtCanvasTransformTarget; bounds: ArtCanvasVisualBounds } => Boolean(entry.bounds));
  if (entries.length < 2) return {};
  const targetEdge = edge === "left" || edge === "top"
    ? Math.min(...entries.map((entry) => entry.bounds[edge]))
    : Math.max(...entries.map((entry) => entry.bounds[edge]));
  const positions: ArtCanvasLivePositions = {};
  for (const entry of entries) {
    const pixelDelta = targetEdge - entry.bounds[edge];
    const worldDeltaX = direction === "left" || direction === "right" ? pixelDelta / previewScale : 0;
    const worldDeltaY = direction === "up" || direction === "down" ? pixelDelta / previewScale : 0;
    Object.assign(positions, translatedArtCanvasPositions([entry.target], worldDeltaX, worldDeltaY));
  }
  return positions;
}

export function centeredArtCanvasPositions(targets: ArtCanvasTransformTarget[]): ArtCanvasLivePositions {
  if (targets.length < 2) return {};
  const largest = targets.reduce((current, candidate) => {
    const renderedArea = (target: ArtCanvasTransformTarget): number => {
      const width = Math.max(0, resolvedNumber(target.component, target.resolvedProps, "width", 0));
      const height = Math.max(0, resolvedNumber(target.component, target.resolvedProps, "height", 0));
      const scale = Math.abs(resolvedNumber(target.component, target.resolvedProps, "scale", 1));
      return width * height * scale * scale;
    };
    return renderedArea(candidate) > renderedArea(current) ? candidate : current;
  });
  const center = {
    x: Number((Math.max(0, resolvedNumber(largest.component, largest.resolvedProps, "width", 0)) / 2).toFixed(3)),
    y: Number((Math.max(0, resolvedNumber(largest.component, largest.resolvedProps, "height", 0)) / 2).toFixed(3))
  };
  return Object.fromEntries(targets.map((target) => [target.id, { ...center }]));
}

export function applyArtCanvasTransformKeyframes(
  timeline: TimelineDocument | null | undefined,
  patches: ArtCanvasTransformPatch[],
  frame: number
): TimelineDocument {
  if (patches.length === 0) return effectiveArtVisibilityTimeline(timeline);
  return patches.reduce((nextTimeline, { target, patch }) => {
    const stampedComponent = {
      ...target.component,
      ...target.resolvedProps,
      ...patch,
      id: target.id
    } as ArtComponent;
    return addTransformKeyframe(nextTimeline, stampedComponent, frame);
  }, timeline as TimelineDocument | null | undefined) as TimelineDocument;
}
