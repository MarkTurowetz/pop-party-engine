import type { TimelineDocument, TimelineKeyframe, TimelinePropertyValue } from "../../../shared/timeline-model";
import type { ArtComponent } from "../../types/game-data";
import { timelineSnapshotAt } from "../../runtime/timelinePlayer";
import { artInspectorNumberExpressionValue } from "./artInspectorNumberExpression";
import { addTransformKeyframe, updateTimelineKeyframe } from "./artTimelineModel";

export interface TimelineKeyframeSelection {
  targetId: string;
  frame: number;
}

export interface SelectedTimelineKeyframe {
  selection: TimelineKeyframeSelection;
  keyframe: TimelineKeyframe;
}

export interface SharedTimelineKeyframeProperty {
  key: string;
  value: TimelinePropertyValue | "";
  mixed: boolean;
  numeric: boolean;
}

export function timelineKeyframeSelectionKey(selection: TimelineKeyframeSelection): string {
  return `${selection.targetId}\u0000${selection.frame}`;
}

export function updateTimelineKeyframeCellSelection(
  current: TimelineKeyframeSelection[],
  selection: TimelineKeyframeSelection,
  additive: boolean
): TimelineKeyframeSelection[] {
  const normalized = { targetId: String(selection.targetId || ""), frame: Math.max(0, Math.round(Number(selection.frame) || 0)) };
  if (!normalized.targetId) return additive ? current : [];
  if (!additive) return [normalized];
  const selectedKey = timelineKeyframeSelectionKey(normalized);
  const exists = current.some((item) => timelineKeyframeSelectionKey(item) === selectedKey);
  return exists
    ? current.filter((item) => timelineKeyframeSelectionKey(item) !== selectedKey)
    : [...current, normalized];
}

export function selectedTimelineKeyframes(
  timeline: TimelineDocument,
  selections: TimelineKeyframeSelection[]
): SelectedTimelineKeyframe[] {
  const tracks = new Map(timeline.tracks.map((track) => [track.targetId, track]));
  return selections.flatMap((selection) => {
    const keyframe = tracks.get(selection.targetId)?.keyframes.find((item) => item.frame === selection.frame);
    return keyframe ? [{ selection, keyframe }] : [];
  });
}

export function sharedTimelineKeyframeProperties(entries: SelectedTimelineKeyframe[]): SharedTimelineKeyframeProperty[] {
  if (!entries.length) return [];
  const sharedKeys = Object.keys(entries[0].keyframe.props || {}).filter((key) =>
    entries.every((entry) => Object.prototype.hasOwnProperty.call(entry.keyframe.props || {}, key))
  );
  return sharedKeys.map((key) => {
    const values = entries.map((entry) => entry.keyframe.props[key]);
    const firstValue = values[0];
    const mixed = values.some((value) => value !== firstValue);
    return {
      key,
      value: mixed ? "" : firstValue,
      mixed,
      numeric: values.every((value) => typeof value === "number" && Number.isFinite(value))
    };
  });
}

function multiKeyframeNumericValue(raw: string, currentValue: unknown): number | null {
  const source = raw.trim();
  if (!source) return null;
  if (source.startsWith("=")) return artInspectorNumberExpressionValue(source.slice(1), currentValue);
  if (/^[+-](?:\d+(?:\.\d*)?|\.\d+)$/.test(source)) {
    const current = Number(currentValue);
    const delta = Number(source);
    return Number.isFinite(current) && Number.isFinite(delta) ? current + delta : null;
  }
  return artInspectorNumberExpressionValue(source, currentValue);
}

export function updateSelectedTimelineKeyframeProperty(
  timeline: TimelineDocument,
  selections: TimelineKeyframeSelection[],
  property: string,
  rawValue: string
): TimelineDocument {
  const entries = selectedTimelineKeyframes(timeline, selections);
  if (!entries.length || !property || !rawValue.trim()) return timeline;
  let nextTimeline = timeline;
  for (const entry of entries) {
    const currentValue = entry.keyframe.props[property];
    const nextValue = typeof currentValue === "number"
      ? multiKeyframeNumericValue(rawValue, currentValue)
      : rawValue;
    if (nextValue === null) return timeline;
    nextTimeline = updateTimelineKeyframe(
      nextTimeline,
      entry.selection.targetId,
      entry.selection.frame,
      { props: { ...entry.keyframe.props, [property]: nextValue } }
    );
  }
  return nextTimeline;
}

export function addTransformKeyframesForSelections(
  timeline: TimelineDocument,
  selections: TimelineKeyframeSelection[],
  resolveTarget: (
    selection: TimelineKeyframeSelection,
    displayedProps: Record<string, TimelinePropertyValue>
  ) => ArtComponent | null | undefined
): TimelineDocument {
  const existing = new Set(selectedTimelineKeyframes(timeline, selections).map(({ selection }) => timelineKeyframeSelectionKey(selection)));
  const prepared = selections.flatMap((selection) => {
    if (existing.has(timelineKeyframeSelectionKey(selection))) return [];
    const displayedProps = timelineSnapshotAt(timeline, selection.frame).targets[selection.targetId] || {};
    const target = resolveTarget(selection, displayedProps);
    return target ? [{ selection, target }] : [];
  });
  return prepared.reduce(
    (nextTimeline, { selection, target }) => addTransformKeyframe(nextTimeline, target, selection.frame),
    timeline
  );
}
