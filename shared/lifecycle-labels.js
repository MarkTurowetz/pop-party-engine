"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartyGameLifecycleLabels = exports.lifecycleLabels = void 0;
exports.canonicalLifecycleLabel = canonicalLifecycleLabel;
exports.normalizeLifecycleLabel = normalizeLifecycleLabel;
exports.lifecycleLabelsMatch = lifecycleLabelsMatch;
exports.uniqueTimelineLabelMatch = uniqueTimelineLabelMatch;
exports.lifecycleLabels = Object.freeze({
    park: "Park",
    on: "On",
    off: "Off",
    appear: "Appear",
    update: "Update",
    disappear: "Disappear"
});
const legacyByCanonical = new Map(Object.entries(exports.lifecycleLabels).flatMap(([legacy, canonical]) => [[legacy, canonical], [canonical, canonical]]));
function canonicalLifecycleLabel(value) {
    return legacyByCanonical.get(String(value ?? "").trim()) || null;
}
function normalizeLifecycleLabel(value) {
    const text = String(value ?? "").trim();
    return canonicalLifecycleLabel(text) || text;
}
function lifecycleLabelsMatch(left, right) {
    const leftText = String(left ?? "").trim();
    const rightText = String(right ?? "").trim();
    const leftLifecycle = canonicalLifecycleLabel(leftText);
    const rightLifecycle = canonicalLifecycleLabel(rightText);
    if (leftLifecycle || rightLifecycle)
        return Boolean(leftLifecycle && rightLifecycle && leftLifecycle === rightLifecycle);
    return leftText === rightText;
}
function uniqueTimelineLabelMatch(labels, requested) {
    const matches = (labels || []).filter((label) => lifecycleLabelsMatch(label.name, requested));
    return matches.length === 1 ? matches[0] : null;
}
exports.PartyGameLifecycleLabels = {
    lifecycleLabels: exports.lifecycleLabels,
    canonicalLifecycleLabel,
    normalizeLifecycleLabel,
    lifecycleLabelsMatch,
    uniqueTimelineLabelMatch
};
if (typeof globalThis !== "undefined") {
    globalThis.PartyGameLifecycleLabels =
        exports.PartyGameLifecycleLabels;
}
