import type { TimelineDocument, TimelineProperties } from "../../../shared/timeline-model";
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
  let parentFrame = Math.max(0, Math.round(Number(start) || 0));
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
        if (command.type !== "emit") return;
        const nestedTargetId = String(command.target || "").trim();
        const nestedAnimation = String(command.event || "").trim();
        if (nestedTargetId && nestedAnimation) playNestedTargetTimeline(nestedTargetId, nestedAnimation);
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
      if (command.type !== "emit") return;
      const targetId = String(command.target || "").trim();
      const animation = String(command.event || "").trim();
      if (targetId && animation) playNestedTargetTimeline(targetId, animation);
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
