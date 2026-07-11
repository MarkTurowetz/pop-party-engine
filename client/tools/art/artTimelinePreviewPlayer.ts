import { frameForTimelineLabel, timelinePlaybackDuration, type TimelineCommand, type TimelineDocument } from "../../../shared/timeline-model";
import { TimelinePlayer } from "../../runtime/timelinePlayer";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { artComponentTargetPathId, findArtComponentTargetPath } from "../shared/artComponentTargets";
import { effectiveArtVisibilityTimeline } from "./artTimelineModel";
import { scopeTimelinePreviewOverridesToComponent, type TimelinePreviewOverrides } from "./artTimelinePreviewMapping";

export type { TimelinePreviewOverrides } from "./artTimelinePreviewMapping";

export interface ArtTimelinePreviewPlayback {
  stop: () => void;
}

export interface PlayArtTimelinePreviewOptions {
  timeline: TimelineDocument;
  component?: ArtComponent;
  start: string | number;
  scopeRootPath?: boolean;
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
  onPreview: (frame: number, overrides: TimelinePreviewOverrides) => void;
  onComplete?: () => void;
}

export interface ArtTimelineReferenceOptions {
  scopeRootPath?: boolean;
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
}

const MAX_NESTED_PREVIEW_DEPTH = 20;

interface TimelinePreviewContext {
  rootComponent: ArtComponent;
  timelineComponent: ArtComponent;
  outputTargetId: string;
  options: ArtTimelineReferenceOptions;
}

interface TimelinePreviewTarget {
  component: ArtComponent;
  outputTargetId: string;
}

function nestedAnimationForCommand(command: { type?: string; target?: string; event?: string }): { targetId: string; animation: string; mode: "play" | "stop" } | null {
  if (command.type !== "emit" && command.type !== "playComponent" && command.type !== "stopComponent") return null;
  const targetId = String(command.target || "").trim();
  const animation = String(command.event || "").trim();
  return targetId && animation ? { targetId, animation, mode: command.type === "stopComponent" ? "stop" : "play" } : null;
}

function timelineForPreviewComponent(component: ArtComponent, options: ArtTimelineReferenceOptions): TimelineDocument {
  const referenced = String(component.kind || "").toLowerCase() === "reference" ? options.resolveReference?.(component) || null : null;
  return effectiveArtVisibilityTimeline(((referenced?.timeline || component.timeline || null) as TimelineDocument | null), component);
}

function previewPathId(path: string[], options: ArtTimelineReferenceOptions): string {
  const scopedPath = options.scopeRootPath === false ? path.slice(1) : path;
  return artComponentTargetPathId(scopedPath);
}

function rootPreviewTargetId(component: ArtComponent, options: ArtTimelineReferenceOptions): string {
  if (options.scopeRootPath === false) return "";
  return String(component.id || "").trim();
}

function appendPreviewTargetId(parentTargetId: string, suffix: string[]): string {
  return artComponentTargetPathId([...cleanPreviewTargetParts(parentTargetId), ...suffix]);
}

function cleanPreviewTargetParts(id: string): string[] {
  return String(id || "").split("/").map((part) => part.trim()).filter(Boolean);
}

function resolvePreviewTarget(context: TimelinePreviewContext, targetId: string): TimelinePreviewTarget | null {
  const cleanTargetId = String(targetId || "").trim();
  if (!cleanTargetId) return null;
  const localMatch = findArtComponentTargetPath([context.timelineComponent], cleanTargetId, context.options);
  if (localMatch) {
    const localSuffix = localMatch.path.slice(1).filter(Boolean);
    const isRootContext = context.timelineComponent === context.rootComponent;
    return {
      component: localMatch.component,
      outputTargetId: isRootContext ? cleanTargetId : appendPreviewTargetId(context.outputTargetId, localSuffix) || cleanTargetId
    };
  }
  const rootMatch = findArtComponentTargetPath([context.rootComponent], cleanTargetId, context.options);
  if (!rootMatch) return null;
  return {
    component: rootMatch.component,
    outputTargetId: previewPathId(rootMatch.path, context.options) || cleanTargetId
  };
}

export function artTimelineCommandDuration(
  rootComponent: ArtComponent | undefined,
  command: TimelineCommand,
  depth = 0,
  options: ArtTimelineReferenceOptions = {}
): number {
  if (!rootComponent) return 0;
  return artTimelineCommandDurationForContext(
    {
      rootComponent,
      timelineComponent: rootComponent,
      outputTargetId: rootPreviewTargetId(rootComponent, options),
      options
    },
    command,
    depth
  );
}

function artTimelineCommandDurationForContext(context: TimelinePreviewContext, command: TimelineCommand, depth = 0): number {
  const nestedAnimation = nestedAnimationForCommand(command);
  if (!nestedAnimation || nestedAnimation.mode === "stop" || depth >= MAX_NESTED_PREVIEW_DEPTH) return 0;
  const target = resolvePreviewTarget(context, nestedAnimation.targetId);
  if (!target) return 0;
  const targetTimeline = timelineForPreviewComponent(target.component, context.options);
  if (!new TimelinePlayer({ timeline: targetTimeline }).hasLabel(nestedAnimation.animation)) return 0;
  return artTimelinePlaybackDurationForContext(
    {
      ...context,
      timelineComponent: target.component,
      outputTargetId: target.outputTargetId
    },
    targetTimeline,
    nestedAnimation.animation,
    depth + 1
  );
}

export function artTimelinePlaybackDuration(
  timeline: TimelineDocument,
  component: ArtComponent | undefined,
  start: string | number,
  depth = 0,
  options: ArtTimelineReferenceOptions = {}
): number {
  if (!component) {
    return timelinePlaybackDuration(timeline, start);
  }
  return artTimelinePlaybackDurationForContext(
    {
      rootComponent: component,
      timelineComponent: component,
      outputTargetId: rootPreviewTargetId(component, options),
      options
    },
    timeline,
    start,
    depth
  );
}

function artTimelinePlaybackDurationForContext(
  context: TimelinePreviewContext,
  timeline: TimelineDocument,
  start: string | number,
  depth = 0
): number {
  return timelinePlaybackDuration(timeline, start, {
    commandDuration: (command) => artTimelineCommandDurationForContext(context, command, depth)
  });
}

export function playArtTimelinePreview({
  timeline,
  component,
  start,
  scopeRootPath,
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

  const rootContext: TimelinePreviewContext | null = component
    ? {
        rootComponent: component,
        timelineComponent: component,
        outputTargetId: rootPreviewTargetId(component, { scopeRootPath, resolveReference }),
        options: { scopeRootPath, resolveReference }
      }
    : null;

  const playNestedTargetTimeline = (
    context: TimelinePreviewContext,
    targetId: string,
    animation: string,
    mode: "play" | "stop" = "play"
  ): void => {
    if (stopped) return;
    const target = resolvePreviewTarget(context, targetId);
    const nestedTimeline = target ? timelineForPreviewComponent(target.component, context.options) : null;
    if (!target || !new TimelinePlayer({ timeline: nestedTimeline }).hasLabel(animation)) return;
    const targetRawId = String(target.component.id || "").trim();
    const nestedContext: TimelinePreviewContext = {
      ...context,
      timelineComponent: target.component,
      outputTargetId: target.outputTargetId
    };
    const childPlayer = new TimelinePlayer({
      timeline: nestedTimeline,
      onFrame: (snapshot) => {
        Object.assign(
          nestedOverrides,
          scopeTimelinePreviewOverridesToComponent(snapshot.targets, { id: targetRawId }, cleanPreviewTargetParts(target.outputTargetId)) || {}
        );
        publishPreview(parentFrame);
      },
      onCommand: (command) => {
        const nestedAnimation = nestedAnimationForCommand(command);
        if (nestedAnimation) playNestedTargetTimeline(nestedContext, nestedAnimation.targetId, nestedAnimation.animation, nestedAnimation.mode);
      },
      commandDuration: (command) => artTimelineCommandDurationForContext(nestedContext, command, 0)
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
      if (nestedAnimation && rootContext) {
        playNestedTargetTimeline(rootContext, nestedAnimation.targetId, nestedAnimation.animation, nestedAnimation.mode);
      }
    },
    commandDuration: (command) => (rootContext ? artTimelineCommandDurationForContext(rootContext, command, 0) : 0)
  });

  if (typeof start === "number") {
    parentPlayer.playFromFrame(start, {
      complete: completePlayback
    });
  } else {
    parentPlayer.gotoAndPlay(start, {
      complete: completePlayback
    });
  }

  return {
    stop: () => {
      stopped = true;
      parentPlayer?.stop();
      for (const childPlayer of childPlayers) childPlayer.stop();
      childPlayers.length = 0;
    }
  };
}
