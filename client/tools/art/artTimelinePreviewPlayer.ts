import { frameForTimelineLabel, timelinePlaybackDuration, type TimelineCommand, type TimelineDocument, type TimelineProperties } from "../../../shared/timeline-model";
import { TimelinePlayer } from "../../runtime/timelinePlayer";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { artTimelineOrDefault } from "./artTimelineModel";
import { findTimelineTargetComponent } from "./artTimelineTargets";

export type TimelinePreviewOverrides = Record<string, TimelineProperties>;

export interface ArtTimelinePreviewPlayback {
  stop: () => void;
}

export interface PlayArtTimelinePreviewOptions {
  timeline: TimelineDocument;
  component?: ArtComponent;
  start: string | number;
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
  onPreview: (frame: number, overrides: TimelinePreviewOverrides) => void;
  onComplete?: () => void;
}

export interface ArtTimelineReferenceOptions {
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
}

const MAX_NESTED_PREVIEW_DEPTH = 20;

function nestedAnimationForCommand(command: { type?: string; target?: string; event?: string }): { targetId: string; animation: string; mode: "play" | "stop" } | null {
  if (command.type !== "emit" && command.type !== "playComponent" && command.type !== "stopComponent") return null;
  const targetId = String(command.target || "").trim();
  const animation = String(command.event || "").trim();
  return targetId && animation ? { targetId, animation, mode: command.type === "stopComponent" ? "stop" : "play" } : null;
}

function scopedNestedOverrides(parentTargetId: string, parentRawId: string, overrides: TimelinePreviewOverrides): TimelinePreviewOverrides {
  const scoped: TimelinePreviewOverrides = {};
  for (const [targetId, props] of Object.entries(overrides || {})) {
    if (targetId === "self" || targetId === parentRawId || targetId === parentTargetId) {
      scoped[parentTargetId] = props;
    } else if (targetId.includes("/")) {
      scoped[targetId.startsWith(`${parentTargetId}/`) ? targetId : `${parentTargetId}/${targetId}`] = props;
    } else {
      scoped[`${parentTargetId}/${targetId}`] = props;
    }
  }
  return scoped;
}

export function artTimelineCommandDuration(
  rootComponent: ArtComponent | undefined,
  command: TimelineCommand,
  depth = 0,
  options: ArtTimelineReferenceOptions = {}
): number {
  const nestedAnimation = nestedAnimationForCommand(command);
  if (!rootComponent || !nestedAnimation || nestedAnimation.mode === "stop" || depth >= MAX_NESTED_PREVIEW_DEPTH) return 0;
  const target = findTimelineTargetComponent([rootComponent], nestedAnimation.targetId, options);
  if (!target) return 0;
  const targetTimeline = artTimelineOrDefault((target.timeline || null) as TimelineDocument | null);
  if (!new TimelinePlayer({ timeline: targetTimeline }).hasLabel(nestedAnimation.animation)) return 0;
  return artTimelinePlaybackDuration(targetTimeline, target, nestedAnimation.animation, depth + 1, options);
}

export function artTimelinePlaybackDuration(
  timeline: TimelineDocument,
  component: ArtComponent | undefined,
  start: string | number,
  depth = 0,
  options: ArtTimelineReferenceOptions = {}
): number {
  return timelinePlaybackDuration(timeline, start, {
    commandDuration: (command) => artTimelineCommandDuration(component, command, depth, options)
  });
}

export function playArtTimelinePreview({
  timeline,
  component,
  start,
  resolveReference,
  onPreview,
  onComplete
}: PlayArtTimelinePreviewOptions): ArtTimelinePreviewPlayback {
  const childPlayers: TimelinePlayer[] = [];
  const nestedOverrides: TimelinePreviewOverrides = {};
  let parentPlayer: TimelinePlayer | null = null;
  let latestParentOverrides: TimelinePreviewOverrides = {};
  let parentFrame = frameForTimelineLabel(timeline, start);
  let stopped = false;
  let activePlaybackCount = 1;

  const completePlayback = (): void => {
    if (stopped) return;
    activePlaybackCount = Math.max(0, activePlaybackCount - 1);
    if (activePlaybackCount > 0) return;
    stopped = true;
    onComplete?.();
  };

  const publishPreview = (nextParentFrame: number, parentOverrides?: TimelinePreviewOverrides): void => {
    if (stopped) return;
    if (parentOverrides) latestParentOverrides = parentOverrides;
    parentFrame = nextParentFrame;
    onPreview(parentFrame, { ...latestParentOverrides, ...nestedOverrides });
  };

  const playNestedTargetTimeline = (targetId: string, animation: string, mode: "play" | "stop" = "play"): void => {
    if (!component || stopped) return;
    const target = findTimelineTargetComponent([component], targetId, { resolveReference });
    const nestedTimeline = artTimelineOrDefault((target?.timeline || null) as TimelineDocument | null);
    if (!target || !new TimelinePlayer({ timeline: nestedTimeline }).hasLabel(animation)) return;
    const targetRawId = String(target.id || "").trim();
    const childPlayer = new TimelinePlayer({
      timeline: nestedTimeline,
      onFrame: (snapshot) => {
        Object.assign(nestedOverrides, scopedNestedOverrides(targetId, targetRawId, snapshot.targets));
        publishPreview(parentFrame);
      },
      onCommand: (command) => {
        const nestedAnimation = nestedAnimationForCommand(command);
        if (nestedAnimation) playNestedTargetTimeline(nestedAnimation.targetId, nestedAnimation.animation, nestedAnimation.mode);
      },
      commandDuration: (command) => artTimelineCommandDuration(component, command, 0, { resolveReference })
    });
    childPlayers.push(childPlayer);
    if (mode === "stop") {
      childPlayer.gotoAndStop(animation);
      return;
    }
    activePlaybackCount += 1;
    childPlayer.gotoAndPlay(animation, { complete: completePlayback });
  };

  parentPlayer = new TimelinePlayer({
    timeline,
    onFrame: (snapshot) => publishPreview(snapshot.frame, snapshot.targets),
    onCommand: (command) => {
      const nestedAnimation = nestedAnimationForCommand(command);
      if (nestedAnimation) playNestedTargetTimeline(nestedAnimation.targetId, nestedAnimation.animation, nestedAnimation.mode);
    },
    commandDuration: (command) => artTimelineCommandDuration(component, command, 0, { resolveReference })
  });

  parentPlayer.gotoAndPlay(start, {
    complete: completePlayback
  });

  return {
    stop: () => {
      stopped = true;
      parentPlayer?.stop();
      for (const childPlayer of childPlayers) childPlayer.stop();
      childPlayers.length = 0;
    }
  };
}
