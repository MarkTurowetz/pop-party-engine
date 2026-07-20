"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPlayerPointPopupTimeline = defaultPlayerPointPopupTimeline;
exports.migratePlayerPointPopupTimeline = migratePlayerPointPopupTimeline;
function defaultPlayerPointPopupTimeline() {
    const popupFrames = { start: 33, hold: 72, end: 78 };
    const trackFor = (targetId, baseX, baseY) => ({
        targetId,
        keyframes: [
            { frame: 0, props: { opacity: 0, scale: 1, x: baseX, y: baseY }, easing: "hold" },
            { frame: 1, props: { opacity: 1, scale: 1, x: baseX, y: baseY }, easing: "hold" },
            { frame: 2, props: { opacity: 0, scale: 0.9, x: baseX, y: baseY + 8 }, easing: "easeOut" },
            { frame: 12, props: { opacity: 1, scale: 1, x: baseX, y: baseY }, easing: "easeOut" },
            { frame: 13, props: { opacity: 1, scale: 1, x: baseX, y: baseY }, easing: "hold" },
            { frame: 16, props: { opacity: 1, scale: 1, x: baseX, y: baseY }, easing: "hold" },
            { frame: 17, props: { opacity: 1, scale: 1, x: baseX, y: baseY }, easing: "easeIn" },
            { frame: popupFrames.start - 1, props: { opacity: 0, scale: 0.9, x: baseX, y: baseY - 8 }, easing: "easeIn" },
            { frame: popupFrames.start, props: { opacity: 1, scale: 1, x: baseX, y: baseY }, easing: "easeOut" },
            { frame: popupFrames.hold, props: { opacity: 1, scale: 1, x: baseX, y: baseY - 26 }, easing: "easeInOut" },
            { frame: popupFrames.end, props: { opacity: 0, scale: 1, x: baseX, y: baseY - 32 }, easing: "easeIn" }
        ]
    });
    return {
        fps: 30,
        frameCount: popupFrames.end + 1,
        labels: [
            { name: "Park", frame: 0 },
            { name: "Off", frame: 0 },
            { name: "On", frame: 1 },
            { name: "Appear", frame: 2 },
            { name: "Update", frame: 13 },
            { name: "Disappear", frame: 17 },
            { name: "Popup", frame: popupFrames.start }
        ],
        commands: [
            { frame: 0, type: "stop" },
            { frame: 0, type: "setVisible", target: "false" },
            { frame: 1, type: "setVisible", target: "true" },
            { frame: 1, type: "stop" },
            { frame: 2, type: "setVisible", target: "true" },
            { frame: 12, type: "stop" },
            { frame: 13, type: "setVisible", target: "true" },
            { frame: 16, type: "stop" },
            { frame: 17, type: "setVisible", target: "true" },
            { frame: 32, type: "setVisible", target: "false" },
            { frame: 32, type: "stop" },
            { frame: popupFrames.start, type: "setVisible", target: "true" },
            { frame: popupFrames.end, type: "setVisible", target: "false" },
            { frame: popupFrames.end, type: "stop" }
        ],
        tracks: [trackFor("point-text", 75, 30), trackFor("point-shadow", 79, 34)]
    };
}
function migratePlayerPointPopupTimeline(compositionId, timeline) {
    if (String(compositionId || "") !== "player-point-popup")
        return timeline;
    const hasPopup = Array.isArray(timeline?.labels)
        && timeline.labels.some((label) => String(label?.name || "").trim().toLowerCase() === "popup");
    return hasPopup ? timeline : defaultPlayerPointPopupTimeline();
}
