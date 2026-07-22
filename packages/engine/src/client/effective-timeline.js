"use strict";

const { normalizeTimeline, timelineWithDefaultVisibility } = require("../shared/timeline-model");

function effectiveVisibilityTimeline(timeline) {
  const normalized = normalizeTimeline(timeline);
  if (normalized && (normalized.labels.length > 0 || normalized.commands.length > 0 || normalized.tracks.length > 0)) return normalized;
  return timelineWithDefaultVisibility(null, { appear: 500, update: 200, disappear: 500 });
}

function effectiveArtComponentVisibilityTimeline(timeline, targetId) {
  return timelineWithDefaultVisibility(timeline, { appear: 500, update: 200, disappear: 500 }, targetId);
}

module.exports = Object.freeze({ effectiveArtComponentVisibilityTimeline, effectiveVisibilityTimeline });
