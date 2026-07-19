#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  base: "crafting-timer",
  widget: "crafting-timer-widget",
  baseReference: "crafting-timer-reference",
  legacyAnimated: "prefab-crafting-timer-mc",
  legacyAnimatedReference: "crafting-timer-mc-reference"
});

const CANVAS = Object.freeze({ width: 180, height: 180 });
const LIFECYCLE_LABELS = Object.freeze([
  { name: "Off", frame: 0 },
  { name: "Park", frame: 0 },
  { name: "On", frame: 1 },
  { name: "Appear", frame: 2 },
  { name: "Update", frame: 13 },
  { name: "Disappear", frame: 17 }
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function defaultTimerValue() {
  return {
    id: "timer-value",
    name: "Timer Value",
    instanceLabel: "timerValue",
    kind: "text",
    x: 90,
    y: 92,
    width: 130,
    height: 82,
    scale: 1,
    rotation: 0,
    locked: false,
    defaultAnimationState: "Default",
    defaultText: "30",
    fontSize: 60,
    autoFitText: true,
    fontColor: "#17131f",
    fontFamily: "ui-rounded, \"Avenir Next\", \"Trebuchet MS\", system-ui, sans-serif"
  };
}

function defaultTimerBackground() {
  return {
    id: "timer-background",
    name: "Timer Background",
    instanceLabel: "timerBackground",
    kind: "shape",
    x: 90,
    y: 90,
    width: 100,
    height: 100,
    scale: 1,
    rotation: 0,
    locked: false,
    defaultAnimationState: "Default",
    shapeStyle: "rounded",
    fillColor: "#fffdf4",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 50
  };
}

function defaultTimerFill() {
  return {
    id: "timer-fill",
    name: "Timer Fill",
    instanceLabel: "timerFill",
    kind: "shape",
    x: 90,
    y: 90,
    width: 180,
    height: 180,
    scale: 1,
    rotation: 0,
    locked: false,
    defaultAnimationState: "Default",
    shapeStyle: "rounded",
    fillColor: "#2458ff",
    fillCss: "conic-gradient(#2458ff calc(var(--timer-progress, 1) * 1turn), rgba(23, 19, 31, 0.16) 0)",
    borderColor: "#17131f",
    borderWidth: 5,
    borderRadius: 90
  };
}

function sourceVisualComponents(sourceManifest) {
  const compositions = sourceManifest?.compositions || {};
  const candidates = [
    compositions[IDS.base],
    compositions[IDS.widget],
    compositions[IDS.legacyAnimated]
  ];
  return candidates.find((composition) => Array.isArray(composition?.components)
    && composition.components.some((component) => component.id === "timer-value"))?.components || [];
}

function baseComponents(sourceManifest) {
  const source = sourceVisualComponents(sourceManifest);
  const byId = new Map(source.map((component) => [component.id, component]));
  const value = { ...defaultTimerValue(), ...clone(byId.get("timer-value") || {}) };
  const legacyRing = clone(byId.get("timer-fill") || byId.get("timer-ring") || {});
  const fill = {
    ...defaultTimerFill(),
    ...legacyRing,
    id: "timer-fill",
    name: "Timer Fill",
    instanceLabel: "timerFill",
    fillCss: "conic-gradient(#2458ff calc(var(--timer-progress, 1) * 1turn), rgba(23, 19, 31, 0.16) 0)"
  };
  const background = { ...defaultTimerBackground(), ...clone(byId.get("timer-background") || {}) };
  return [value, background, fill].map((component) => ({
    ...component,
    defaultAnimationState: "Default"
  }));
}

function baseComposition(sourceManifest, updatedAt) {
  return {
    name: "Crafting Timer",
    description: "Bespoke timer visual containing only its value, circular fill, and background.",
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { ...CANVAS },
    components: baseComponents(sourceManifest),
    timeline: {
      fps: 30,
      frameCount: 1,
      labels: [{ name: "Default", frame: 0 }],
      commandFrames: [0],
      commands: [{ id: "stop-0", frame: 0, type: "stop" }],
      tracks: []
    },
    updatedAt
  };
}

function referenceComponent() {
  return {
    id: IDS.baseReference,
    name: "Crafting Timer",
    instanceLabel: "craftingTimer",
    kind: "reference",
    x: 90,
    y: 90,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    referenceSizeMode: "intrinsic",
    locked: false,
    defaultAnimationState: "Default",
    artCompositionId: IDS.base
  };
}

function pose(frame, scale, opacity, rotation, easing) {
  return {
    id: `key-crafting-timer-${frame}`,
    frame,
    props: { x: 90, y: 90, scale, rotation, opacity, visible: true },
    easing
  };
}

function defaultLifecycleTimeline() {
  return {
    fps: 30,
    frameCount: 33,
    labels: clone(LIFECYCLE_LABELS),
    commandFrames: [0, 1, 2, 12, 13, 16, 17, 32],
    commands: [
      { id: "stop-0", frame: 0, type: "stop" },
      { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
      { id: "stop-1", frame: 1, type: "stop" },
      { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" },
      { id: "setvisible-2-true", frame: 2, type: "setVisible", target: "true" },
      { id: "stop-12", frame: 12, type: "stop" },
      { id: "setvisible-13-true", frame: 13, type: "setVisible", target: "true" },
      { id: "stop-16", frame: 16, type: "stop" },
      { id: "setvisible-17-true", frame: 17, type: "setVisible", target: "true" },
      { id: "stop-32", frame: 32, type: "stop" },
      { id: "setvisible-32-false", frame: 32, type: "setVisible", target: "false" }
    ],
    tracks: [{
      id: "track-crafting-timer-reference",
      targetId: IDS.baseReference,
      keyframes: [
        pose(0, 0.72, 0, -8, "hold"), pose(1, 1, 1, 0, "hold"),
        pose(2, 0.72, 0, -8, "easeOut"), pose(8, 1.08, 1, 2, "easeOut"),
        pose(12, 1, 1, 0, "hold"), pose(13, 1, 1, 0, "easeOut"),
        pose(14, 1.08, 1, 0, "easeOut"), pose(16, 1, 1, 0, "hold"),
        pose(17, 1, 1, 0, "easeIn"), pose(23, 1.08, 1, 2, "easeIn"),
        pose(32, 0.72, 0, 8, "hold")
      ]
    }]
  };
}

function lifecycleTimeline(sourceManifest) {
  const compositions = sourceManifest?.compositions || {};
  const middleTimeline = compositions[IDS.legacyAnimated]?.timeline;
  const topTimeline = compositions[IDS.widget]?.timeline;
  const source = Array.isArray(middleTimeline?.tracks) && middleTimeline.tracks.length
    ? middleTimeline
    : Array.isArray(topTimeline?.tracks) && topTimeline.tracks.length
      ? topTimeline
      : null;
  if (!source) return defaultLifecycleTimeline();
  const timeline = clone(source);
  timeline.commands = (timeline.commands || []).filter((command) => !["playComponent", "stopComponent"].includes(command.type));
  timeline.tracks = (timeline.tracks || []).map((track) => ({
    ...track,
    targetId: IDS.baseReference,
    keyframes: (track.keyframes || []).map((keyframe) => ({
      ...keyframe,
      props: Object.fromEntries(Object.entries(keyframe.props || {}).filter(([key]) => !["width", "height"].includes(key)))
    }))
  }));
  return timeline;
}

function widgetComposition(sourceManifest, updatedAt) {
  return {
    name: "Crafting Timer Widget MC",
    description: "Lifecycle owner for the complete Crafting Timer widget and its action callback.",
    surface: "stage",
    compositionKind: "gameObject",
    isCustom: false,
    timelineArchitectureVersion: 2,
    canvas: { ...CANVAS },
    components: [referenceComponent()],
    timeline: lifecycleTimeline(sourceManifest),
    updatedAt
  };
}

function updateOrganization(manifest) {
  for (const surface of Object.values(manifest.organization || {})) {
    for (const [folderId, items] of Object.entries(surface?.folderItems || {})) {
      surface.folderItems[folderId] = (items || []).filter((item) => item !== `composition:${IDS.legacyAnimated}`);
    }
  }
  const stage = manifest.organization?.stage;
  if (!stage) return;
  const folder = (stage.folders || []).find((item) => item.name === "Global Assets");
  if (!folder) return;
  stage.folderItems ||= {};
  const items = (stage.folderItems[folder.id] ||= []);
  for (const id of [IDS.base, IDS.widget]) {
    const key = `composition:${id}`;
    if (!items.includes(key)) items.push(key);
  }
}

function migrateCraftingTimerWidget(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest) || {};
  manifest.compositions ||= {};
  const base = baseComposition(manifest, updatedAt);
  const widget = widgetComposition(manifest, updatedAt);
  manifest.compositions[IDS.base] = base;
  manifest.compositions[IDS.widget] = widget;
  delete manifest.compositions[IDS.legacyAnimated];
  manifest.deletedCompositionIds = [...new Set([...(manifest.deletedCompositionIds || []), IDS.legacyAnimated])];
  updateOrganization(manifest);
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art/art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  fs.writeFileSync(filePath, `${JSON.stringify(migrateCraftingTimerWidget(manifest), null, 2)}\n`);
  process.stdout.write(`Flattened Crafting Timer to one lifecycle parent and one visual child in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = {
  CANVAS,
  IDS,
  LIFECYCLE_LABELS,
  baseComposition,
  migrateCraftingTimerWidget,
  widgetComposition
};
