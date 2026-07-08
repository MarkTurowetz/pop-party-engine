import { defaultVisibilityTimeline, normalizeTimeline, type TimelineCommand, type TimelineDocument } from "../../shared/timeline-model";

function commandKey(command: TimelineCommand): string {
  return [command.frame, command.type, command.target || "", command.event || ""].join("|");
}

export function effectiveVisibilityTimeline(timeline: TimelineDocument | null | undefined): TimelineDocument {
  const current = normalizeTimeline(timeline) || { fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] };
  const defaults = defaultVisibilityTimeline({ appear: 500, update: 200, disappear: 500 });
  const existingLabelNames = new Set(current.labels.map((label) => label.name));
  const existingCommandKeys = new Set(current.commands.map(commandKey));
  return {
    ...current,
    frameCount: Math.max(current.frameCount, defaults.frameCount),
    labels: [
      ...current.labels,
      ...defaults.labels.filter((label) => !existingLabelNames.has(label.name))
    ].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
    commands: [
      ...current.commands,
      ...defaults.commands.filter((command) => !existingCommandKeys.has(commandKey(command)))
    ].sort((a, b) => a.frame - b.frame)
  };
}
