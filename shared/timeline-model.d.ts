export type TimelinePrimitive = string | number | boolean | null;
export type TimelinePropertyValue = TimelinePrimitive;
export type TimelineProperties = Record<string, TimelinePropertyValue>;
export interface TimelineLabel {
    name: string;
    frame: number;
}
export interface TimelineCommand {
    id?: string;
    frame: number;
    type: "stop" | "gotoAndPlay" | "gotoAndStop" | "emit" | string;
    target?: string;
    event?: string;
}
export interface TimelineKeyframe {
    id?: string;
    frame: number;
    props: TimelineProperties;
    easing?: string;
    rotationDirection?: "clockwise" | "counterclockwise";
    rotationTurns?: number;
}
export interface TimelineTrack {
    id?: string;
    targetId: string;
    keyframes: TimelineKeyframe[];
}
export interface TimelineDocument {
    fps: number;
    frameCount: number;
    labels: TimelineLabel[];
    commandFrames?: number[];
    commands: TimelineCommand[];
    tracks: TimelineTrack[];
}
export interface TimelineSegment {
    label: string;
    startFrame: number;
    endFrame: number;
    durationMs: number;
}
export interface TimelinePlaybackDurationOptions {
    instant?: boolean;
    maxCommandRedirects?: number;
    commandDuration?: (command: TimelineCommand, context: {
        frame: number;
        elapsedMs: number;
    }) => number;
}
export declare function timelineCommandAcceptsTarget(type: string): boolean;
export declare function timelineCommandAcceptsEvent(type: string): boolean;
export declare function normalizeTimeline(raw: unknown, fallback?: unknown): TimelineDocument | null;
export declare function hasTimelineLabel(timeline: TimelineDocument | null | undefined, label: string): boolean;
export declare function tryFrameForTimelineLabel(timeline: TimelineDocument, labelOrFrame: string | number): number | null;
export declare function frameForTimelineLabel(timeline: TimelineDocument, labelOrFrame: string | number): number;
export declare function timelineStopFrame(timeline: TimelineDocument, startFrame: number): number;
export declare function timelineSegmentFor(timeline: TimelineDocument, labelOrFrame: string | number): TimelineSegment;
export declare function timelinePlaybackDuration(timeline: TimelineDocument, labelOrFrame: string | number, options?: TimelinePlaybackDurationOptions): number;
export declare function defaultVisibilityTimeline(durations: Record<string, number>): TimelineDocument;
export declare function timelineWithDefaultVisibility(timeline: TimelineDocument | null | undefined, durations: Record<string, number>, targetId?: string): TimelineDocument;
