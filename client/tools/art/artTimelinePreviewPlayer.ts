import { frameForTimelineLabel, type TimelineDocument, type TimelineProperties } from "../../../shared/timeline-model";
import { TimelinePlayer } from "../../runtime/timelinePlayer";
import type { ArtComponent } from "../../types/game-data";
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
  onPreview: (frame: number, overrides: TimelinePreviewOverrides) => void;
  onComplete?: () => void;
}

export function playArtTimelinePreview({
  timeline,
  component,
  start,
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

  const nestedAnimationForCommand = (command: { type?: string; target?: string; event?: string }): { targetId: string; animation: string } | null => {
    if (command.type !== "emit" && command.type !== "playComponent") return null;
    const targetId = String(command.target || "").trim();
    const animation = String(command.event || "").trim();
    return targetId && animation ? { targetId, animation } : null;
  };

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

  const playNestedTargetTimeline = (targetId: string, animation: string): void => {
    if (!component || stopped) return;
    const target = findTimelineTargetComponent([component], targetId);
    const nestedTimeline = artTimelineOrDefault((target?.timeline || null) as TimelineDocument | null);
    if (!target || !new TimelinePlayer({ timeline: nestedTimeline }).hasLabel(animation)) return;
    const childPlayer = new TimelinePlayer({
      timeline: nestedTimeline,
      onFrame: (snapshot) => {
        Object.assign(nestedOverrides, snapshot.targets);
        publishPreview(parentFrame);
      },
      onCommand: (command) => {
        const nestedAnimation = nestedAnimationForCommand(command);
        if (nestedAnimation) playNestedTargetTimeline(nestedAnimation.targetId, nestedAnimation.animation);
      }
    });
    childPlayers.push(childPlayer);
    activePlaybackCount += 1;
    childPlayer.gotoAndPlay(animation, { complete: completePlayback });
  };

  parentPlayer = new TimelinePlayer({
    timeline,
    onFrame: (snapshot) => publishPreview(snapshot.frame, snapshot.targets),
    onCommand: (command) => {
      const nestedAnimation = nestedAnimationForCommand(command);
      if (nestedAnimation) playNestedTargetTimeline(nestedAnimation.targetId, nestedAnimation.animation);
    }
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
