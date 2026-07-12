"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timelineCommandAcceptsTarget = timelineCommandAcceptsTarget;
exports.timelineCommandAcceptsEvent = timelineCommandAcceptsEvent;
exports.normalizeTimeline = normalizeTimeline;
exports.hasTimelineLabel = hasTimelineLabel;
exports.frameForTimelineLabel = frameForTimelineLabel;
exports.timelineStopFrame = timelineStopFrame;
exports.timelineSegmentFor = timelineSegmentFor;
exports.timelinePlaybackDuration = timelinePlaybackDuration;
exports.defaultVisibilityTimeline = defaultVisibilityTimeline;
exports.timelineWithDefaultVisibility = timelineWithDefaultVisibility;
const DEFAULT_FPS = 30;
const DEFAULT_FRAME_COUNT = 1;
const MAX_FRAME_COUNT = 60 * 60 * 10;
const MAX_LABELS = 500;
const MAX_COMMANDS = 1000;
const MAX_TRACKS = 1000;
const MAX_KEYFRAMES_PER_TRACK = 2000;
function cleanText(value, fallback = "", maxLength = 120) {
    return String(value ?? fallback ?? "").trim().slice(0, maxLength);
}
function cleanFrame(value, fallback = 0, max = MAX_FRAME_COUNT) {
    const next = Number(value);
    if (!Number.isFinite(next))
        return fallback;
    return Math.max(0, Math.min(max, Math.round(next)));
}
function cleanPositiveNumber(value, fallback, min, max) {
    const next = Number(value);
    if (!Number.isFinite(next))
        return fallback;
    return Math.max(min, Math.min(max, Number(next.toFixed(3))));
}
function cleanPropertyValue(value) {
    if (typeof value === "string")
        return value.slice(0, 1000);
    if (typeof value === "number")
        return Number.isFinite(value) ? Number(value.toFixed(3)) : undefined;
    if (typeof value === "boolean" || value === null)
        return value;
    return undefined;
}
function timelineCommandAcceptsTarget(type) {
    return String(type || "") !== "stop";
}
function timelineCommandAcceptsEvent(type) {
    const cleanType = String(type || "");
    return cleanType === "emit" || cleanType === "playComponent" || cleanType === "stopComponent";
}
function normalizeProps(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const props = {};
    for (const [key, rawValue] of Object.entries(source)) {
        const cleanKey = cleanText(key, "", 80);
        if (!cleanKey)
            continue;
        const cleanValue = cleanPropertyValue(rawValue);
        if (cleanValue !== undefined)
            props[cleanKey] = cleanValue;
    }
    return props;
}
function normalizeTimeline(raw, fallback = null) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
    const base = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : null;
    if (!source && !base)
        return null;
    const input = source || base || {};
    const fps = cleanPositiveNumber(input.fps, DEFAULT_FPS, 1, 120);
    const frameCount = cleanFrame(input.frameCount, DEFAULT_FRAME_COUNT, MAX_FRAME_COUNT) || DEFAULT_FRAME_COUNT;
    const maxFrame = Math.max(0, frameCount - 1);
    const seenLabels = new Set();
    const labels = (Array.isArray(input.labels) ? input.labels : [])
        .slice(0, MAX_LABELS)
        .map((label) => {
        const entry = label && typeof label === "object" && !Array.isArray(label) ? label : {};
        return { name: cleanText(entry.name, "", 80), frame: cleanFrame(entry.frame, 0, maxFrame) };
    })
        .filter((label) => {
        if (!label.name || seenLabels.has(label.name))
            return false;
        seenLabels.add(label.name);
        return true;
    })
        .sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name));
    const commands = (Array.isArray(input.commands) ? input.commands : [])
        .slice(0, MAX_COMMANDS)
        .map((rawCommand) => {
        const entry = rawCommand && typeof rawCommand === "object" && !Array.isArray(rawCommand) ? rawCommand : {};
        const type = cleanText(entry.type, "stop", 40) || "stop";
        const target = cleanText(entry.target, "", 120);
        const event = cleanText(entry.event, "", 120);
        const normalizedCommand = {
            frame: cleanFrame(entry.frame, 0, maxFrame),
            type
        };
        const id = cleanText(entry.id, "", 80);
        if (id)
            normalizedCommand.id = id;
        if (timelineCommandAcceptsTarget(type) && target)
            normalizedCommand.target = target;
        if (timelineCommandAcceptsEvent(type) && event)
            normalizedCommand.event = event;
        return normalizedCommand;
    })
        .sort((a, b) => a.frame - b.frame);
    const tracks = (Array.isArray(input.tracks) ? input.tracks : [])
        .slice(0, MAX_TRACKS)
        .map((track) => {
        const entry = track && typeof track === "object" && !Array.isArray(track) ? track : {};
        const targetId = cleanText(entry.targetId, "", 120);
        const keyframes = (Array.isArray(entry.keyframes) ? entry.keyframes : [])
            .slice(0, MAX_KEYFRAMES_PER_TRACK)
            .map((keyframe) => {
            const frameEntry = keyframe && typeof keyframe === "object" && !Array.isArray(keyframe) ? keyframe : {};
            return {
                id: cleanText(frameEntry.id, "", 80) || undefined,
                frame: cleanFrame(frameEntry.frame, 0, maxFrame),
                props: normalizeProps(frameEntry.props),
                easing: cleanText(frameEntry.easing, "", 40) || undefined
            };
        })
            .filter((keyframe) => Object.keys(keyframe.props).length > 0)
            .sort((a, b) => a.frame - b.frame);
        return { id: cleanText(entry.id, "", 80) || undefined, targetId, keyframes };
    })
        .filter((track) => track.targetId && track.keyframes.length > 0);
    return normalizeOffAnimationVisibility({ fps, frameCount, labels, commands, tracks });
}
function normalizeOffAnimationVisibility(timeline) {
    const offFrames = new Set(timeline.labels.filter((label) => label.name.toLowerCase() === "off").map((label) => label.frame));
    if (offFrames.size === 0)
        return timeline;
    const commands = [
        ...timeline.commands.filter((command) => !(offFrames.has(command.frame) && command.type === "setVisible")),
        ...[...offFrames].map((frame) => ({ frame, type: "setVisible", target: "false" }))
    ].sort((a, b) => a.frame - b.frame);
    const tracks = timeline.tracks.map((track) => {
        let keyframes = track.keyframes.map((keyframe) => {
            if (!offFrames.has(keyframe.frame))
                return keyframe;
            const props = { ...keyframe.props, opacity: 1 };
            delete props.visible;
            return { ...keyframe, props };
        });
        const existingFrames = new Set(keyframes.map((keyframe) => keyframe.frame));
        for (const frame of offFrames) {
            if (existingFrames.has(frame))
                continue;
            keyframes.push({
                id: `key-${track.targetId}-${frame}`,
                frame,
                props: { opacity: 1 },
                easing: "hold"
            });
        }
        keyframes = keyframes.sort((a, b) => a.frame - b.frame);
        return { ...track, keyframes };
    });
    return { ...timeline, commands, tracks };
}
function hasTimelineLabel(timeline, label) {
    return Boolean(timeline?.labels.some((entry) => entry.name === label));
}
function frameForTimelineLabel(timeline, labelOrFrame) {
    if (typeof labelOrFrame === "number")
        return cleanFrame(labelOrFrame, 0, Math.max(0, timeline.frameCount - 1));
    const label = timeline.labels.find((entry) => entry.name === labelOrFrame);
    return label ? label.frame : 0;
}
function timelineStopFrame(timeline, startFrame) {
    const maxFrame = Math.max(0, timeline.frameCount - 1);
    const stop = timeline.commands.find((command) => command.type === "stop" && command.frame >= startFrame);
    return stop ? stop.frame : maxFrame;
}
function timelineSegmentFor(timeline, labelOrFrame) {
    const label = typeof labelOrFrame === "string" ? labelOrFrame : String(labelOrFrame);
    const startFrame = frameForTimelineLabel(timeline, labelOrFrame);
    const endFrame = timelineStopFrame(timeline, startFrame);
    return {
        label,
        startFrame,
        endFrame,
        durationMs: Math.max(0, ((endFrame - startFrame) * 1000) / timeline.fps)
    };
}
function cleanMaxCommandRedirects(value) {
    if (value === undefined || value === null)
        return 50;
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 50;
}
function cleanCommandDuration(value) {
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(0, next) : 0;
}
function timelineFrameCommandDuration(timeline, frame, elapsedMs, remainingRedirects, options) {
    let durationMs = 0;
    for (const command of timeline.commands.filter((entry) => entry.frame === frame)) {
        if ((command.type === "gotoAndPlay" || command.type === "gotoAndStop") && command.target) {
            if (remainingRedirects <= 0)
                return { durationMs, redirected: false };
            if (command.type === "gotoAndStop") {
                const targetFrame = frameForTimelineLabel(timeline, command.target);
                const redirected = timelineFrameCommandDuration(timeline, targetFrame, 0, remainingRedirects - 1, options);
                return { durationMs: Math.max(durationMs, elapsedMs + redirected.durationMs), redirected: true };
            }
            return {
                durationMs: Math.max(durationMs, elapsedMs +
                    timelinePlaybackDuration(timeline, command.target, {
                        ...options,
                        maxCommandRedirects: remainingRedirects - 1
                    })),
                redirected: true
            };
        }
        durationMs = Math.max(durationMs, elapsedMs + cleanCommandDuration(options.commandDuration?.(command, { frame, elapsedMs })));
    }
    return { durationMs, redirected: false };
}
function timelinePlaybackDuration(timeline, labelOrFrame, options = {}) {
    const maxCommandRedirects = cleanMaxCommandRedirects(options.maxCommandRedirects);
    const segment = timelineSegmentFor(timeline, labelOrFrame);
    if (options.instant === true || segment.durationMs === 0) {
        return timelineFrameCommandDuration(timeline, segment.endFrame, 0, maxCommandRedirects, options).durationMs;
    }
    let durationMs = 0;
    for (let frame = segment.startFrame; frame <= segment.endFrame; frame += 1) {
        const elapsedMs = Math.max(0, ((frame - segment.startFrame) * 1000) / timeline.fps);
        const frameCommands = timelineFrameCommandDuration(timeline, frame, elapsedMs, maxCommandRedirects, options);
        durationMs = Math.max(durationMs, frameCommands.durationMs);
        if (frameCommands.redirected)
            return durationMs;
    }
    return Math.max(segment.durationMs, durationMs);
}
function defaultVisibilityTimeline(durations) {
    const fps = DEFAULT_FPS;
    const frameForMs = (ms) => Math.max(1, Math.round((Math.max(0, ms) / 1000) * fps));
    const appearFrames = frameForMs(durations.appear || 0);
    const updateFrames = frameForMs(durations.update || 0);
    const disappearFrames = frameForMs(durations.disappear || 0);
    const park = 0;
    const on = 1;
    const appear = 2;
    const update = appear + appearFrames + 1;
    const disappear = update + updateFrames + 1;
    const off = disappear + disappearFrames + 1;
    const frameCount = off + 1;
    return normalizeOffAnimationVisibility({
        fps,
        frameCount,
        labels: [
            { name: "park", frame: park },
            { name: "off", frame: park },
            { name: "on", frame: on },
            { name: "appear", frame: appear },
            { name: "update", frame: update },
            { name: "disappear", frame: disappear }
        ],
        commands: [
            { frame: park, type: "stop" },
            { frame: on, type: "stop" },
            { frame: appear + appearFrames, type: "stop" },
            { frame: update + updateFrames, type: "stop" },
            { frame: disappear + disappearFrames, type: "stop" },
            { frame: off, type: "stop" }
        ],
        tracks: []
    });
}
function defaultVisibilityCommandKey(command) {
    return [command.frame, command.type, command.target || "", command.event || ""].join("|");
}
function defaultVisibilityLabelFrame(timeline, name) {
    return timeline.labels.find((label) => label.name === name)?.frame ?? 0;
}
function mergeDefaultVisibilityKeyframeProps(track, frame, props, easing) {
    const existingIndex = track.keyframes.findIndex((keyframe) => keyframe.frame === frame);
    if (existingIndex >= 0) {
        const keyframes = track.keyframes.slice();
        const existing = keyframes[existingIndex];
        keyframes[existingIndex] = {
            ...existing,
            props: { ...props, ...existing.props },
            easing: existing.easing || easing
        };
        return { ...track, keyframes: keyframes.sort((a, b) => a.frame - b.frame) };
    }
    return {
        ...track,
        keyframes: [
            ...track.keyframes,
            {
                id: `key-${track.targetId}-${frame}`,
                frame,
                props,
                easing
            }
        ].sort((a, b) => a.frame - b.frame)
    };
}
function mergeDefaultVisibilityTrack(timeline, defaults, targetId) {
    const cleanTargetId = String(targetId || "").trim();
    if (!cleanTargetId)
        return timeline;
    const appearFrame = defaultVisibilityLabelFrame(defaults, "appear");
    const appearStopFrame = timelineStopFrame(defaults, appearFrame);
    const updateFrame = defaultVisibilityLabelFrame(defaults, "update");
    const updateStopFrame = timelineStopFrame(defaults, updateFrame);
    const disappearFrame = defaultVisibilityLabelFrame(defaults, "disappear");
    const disappearStopFrame = timelineStopFrame(defaults, disappearFrame);
    const existingTrack = timeline.tracks.find((track) => track.targetId === cleanTargetId);
    let nextTrack = existingTrack || { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [] };
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, defaultVisibilityLabelFrame(defaults, "park"), { opacity: 0, visible: false }, "hold");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, defaultVisibilityLabelFrame(defaults, "on"), { opacity: 1, visible: true }, "hold");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, appearFrame, { opacity: 0, visible: true }, "easeOut");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, appearStopFrame, { opacity: 1, visible: true }, "hold");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, updateFrame, { opacity: 1, visible: true }, "hold");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, updateStopFrame, { opacity: 1, visible: true }, "hold");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, disappearFrame, { opacity: 1, visible: true }, "easeIn");
    nextTrack = mergeDefaultVisibilityKeyframeProps(nextTrack, disappearStopFrame, { opacity: 0, visible: false }, "hold");
    return normalizeOffAnimationVisibility({
        ...timeline,
        tracks: [...timeline.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack].sort((a, b) => a.targetId.localeCompare(b.targetId))
    });
}
function timelineWithDefaultVisibility(timeline, durations, targetId = "") {
    const current = normalizeTimeline(timeline) || { fps: DEFAULT_FPS, frameCount: DEFAULT_FRAME_COUNT, labels: [], commands: [], tracks: [] };
    const rawDefaults = defaultVisibilityTimeline(durations);
    const hasAuthoredContent = current.labels.length > 0 || current.commands.length > 0 || current.tracks.length > 0;
    const defaultFrameOffset = hasAuthoredContent ? current.frameCount : 0;
    const defaults = defaultFrameOffset > 0
        ? {
            ...rawDefaults,
            frameCount: rawDefaults.frameCount + defaultFrameOffset,
            labels: rawDefaults.labels.map((label) => ({ ...label, frame: label.frame + defaultFrameOffset })),
            commands: rawDefaults.commands.map((command) => ({ ...command, frame: command.frame + defaultFrameOffset })),
            tracks: rawDefaults.tracks.map((track) => ({
                ...track,
                keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, frame: keyframe.frame + defaultFrameOffset }))
            }))
        }
        : rawDefaults;
    const existingLabelNames = new Set(current.labels.map((label) => label.name));
    const existingCommandKeys = new Set(current.commands.map(defaultVisibilityCommandKey));
    const missingDefaultLabels = defaults.labels.filter((label) => !existingLabelNames.has(label.name));
    const shouldMergeDefaultCommands = !hasAuthoredContent || missingDefaultLabels.length > 0;
    const withDefaults = {
        ...current,
        frameCount: Math.max(current.frameCount, defaults.frameCount),
        labels: [
            ...current.labels,
            ...missingDefaultLabels
        ].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
        commands: [
            ...current.commands,
            ...(shouldMergeDefaultCommands ? defaults.commands.filter((command) => !existingCommandKeys.has(defaultVisibilityCommandKey(command))) : [])
        ].sort((a, b) => a.frame - b.frame)
    };
    return mergeDefaultVisibilityTrack(withDefaults, defaults, targetId);
}
