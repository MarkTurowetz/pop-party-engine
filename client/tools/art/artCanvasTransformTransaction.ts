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
