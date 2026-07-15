#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  base: "crafting-timer",
  animated: "prefab-crafting-timer-mc",
  widget: "crafting-timer-widget",
  baseReference: "crafting-timer-reference",
  animatedReference: "crafting-timer-mc-reference"
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

function fallbackBaseComponents() {
  return [
    {
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
      autoFitText: false,
      fontColor: "#17131f",
      fontFamily: "ui-rounded, \"Avenir Next\", \"Trebuchet MS\", system-ui, sans-serif"
    },
    {
      id: "timer-ring",
      name: "Timer Ring",
      instanceLabel: "timerRing",
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
      fillColor: "#fffdf4",
      fillCss: "radial-gradient(circle at center, #fffdf4 0 54%, transparent 55%), conic-gradient(#2458ff calc(var(--timer-progress, 1) * 1turn), rgba(23, 19, 31, 0.16) 0)",
      borderColor: "#17131f",
      borderWidth: 5,
      borderRadius: 36
    }
  ];
}

function baseComponents(sourceManifest) {
  const compositions = sourceManifest?.compositions || {};
  const existingBase = compositions[IDS.base];
  const legacyWidget = compositions[IDS.widget];
  const source = Array.isArray(existingBase?.components) && existingBase.components.length
    ? existingBase.components
    : Array.isArray(legacyWidget?.components) && legacyWidget.components.some((component) => component.id === "timer-value")
      ? legacyWidget.components
      : fallbackBaseComponents();
  return clone(source).map((component) => ({ ...component, defaultAnimationState: "Default" }));
}

function baseComposition(sourceManifest, updatedAt) {
  return {
    name: "Crafting Timer",
    description: "Base visual prefab for the crafting timer value and progress ring.",
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

function referenceComponent({ id, name, instanceLabel, artCompositionId, defaultAnimationState }) {
  return {
    id,
    name,
    instanceLabel,
    kind: "reference",
    x: 90,
    y: 90,
    width: 180,
    height: 180,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState,
    artCompositionId
  };
}

function pose(frame, scale, opacity, rotation, easing) {
  return {
    id: `key-crafting-timer-${frame}`,
    frame,
    props: {
      x: 90,
      y: 90,
      width: 180,
      height: 180,
      scale,
      rotation,
      opacity,
      visible: true
    },
    easing
  };
}

function animatedComposition(updatedAt) {
  return {
    name: "Crafting Timer MC",
    description: "Animated lifecycle wrapper for the Crafting Timer base visual.",
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { ...CANVAS },
    components: [referenceComponent({
      id: IDS.baseReference,
      name: "Crafting Timer",
      instanceLabel: "craftingTimer",
      artCompositionId: IDS.base,
      defaultAnimationState: "Default"
    })],
    timeline: {
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
          pose(0, 0.72, 0, -8, "hold"),
          pose(1, 1, 1, 0, "hold"),
          pose(2, 0.72, 0, -8, "easeOut"),
          pose(8, 1.08, 1, 2, "easeOut"),
          pose(12, 1, 1, 0, "hold"),
          pose(13, 1, 1, 0, "easeOut"),
          pose(14, 1.08, 1, 0, "easeOut"),
          pose(16, 1, 1, 0, "hold"),
          pose(17, 1, 1, 0, "easeIn"),
          pose(23, 1.08, 1, 2, "easeIn"),
          pose(32, 0.72, 0, 8, "hold")
        ]
      }]
    },
    updatedAt
  };
}

function widgetComposition(updatedAt) {
  return {
    name: "Crafting Timer Widget MC",
    description: "Compound crafting timer whose parent timeline owns Set Timer Shown completion callbacks.",
    surface: "stage",
    compositionKind: "gameObject",
    isCustom: false,
    timelineArchitectureVersion: 2,
    canvas: { ...CANVAS },
    components: [referenceComponent({
      id: IDS.animatedReference,
      name: "Crafting Timer MC",
      instanceLabel: "craftingTimerMC",
      artCompositionId: IDS.animated,
      defaultAnimationState: "Off"
    })],
    timeline: {
      fps: 30,
      frameCount: 33,
      labels: clone(LIFECYCLE_LABELS),
      commandFrames: [0, 1, 2, 12, 13, 16, 17, 32],
      commands: [
        { id: "stop-0", frame: 0, type: "stop" },
        { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
        { id: "timer-mc-off", frame: 0, type: "stopComponent", target: IDS.animatedReference, event: "Off" },
        { id: "stop-1", frame: 1, type: "stop" },
        { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" },
        { id: "timer-mc-on", frame: 1, type: "stopComponent", target: IDS.animatedReference, event: "On" },
        { id: "setvisible-2-true", frame: 2, type: "setVisible", target: "true" },
        { id: "timer-mc-appear", frame: 2, type: "playComponent", target: IDS.animatedReference, event: "Appear" },
        { id: "stop-12", frame: 12, type: "stop" },
        { id: "timer-mc-update", frame: 13, type: "playComponent", target: IDS.animatedReference, event: "Update" },
        { id: "stop-16", frame: 16, type: "stop" },
        { id: "timer-mc-disappear", frame: 17, type: "playComponent", target: IDS.animatedReference, event: "Disappear" },
        { id: "stop-32", frame: 32, type: "stop" },
        { id: "setvisible-32-false", frame: 32, type: "setVisible", target: "false" }
      ],
      tracks: []
    },
    updatedAt
  };
}

function addToGlobalAssets(manifest) {
  const stage = manifest.organization?.stage;
  if (!stage) return;
  const folder = (stage.folders || []).find((item) => item.name === "Global Assets");
  if (!folder) return;
  stage.folderItems ||= {};
  const items = (stage.folderItems[folder.id] ||= []);
  for (const id of [IDS.base, IDS.animated, IDS.widget]) {
    const key = `composition:${id}`;
    if (!items.includes(key)) items.push(key);
  }
}

function migrateCraftingTimerWidget(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest) || {};
  manifest.compositions ||= {};
  manifest.compositions[IDS.base] = baseComposition(manifest, updatedAt);
  manifest.compositions[IDS.animated] = animatedComposition(updatedAt);
  manifest.compositions[IDS.widget] = widgetComposition(updatedAt);
  addToGlobalAssets(manifest);
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art/art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  fs.writeFileSync(filePath, `${JSON.stringify(migrateCraftingTimerWidget(manifest), null, 2)}\n`);
  process.stdout.write(`Converted Crafting Timer to authored widget timelines in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = {
  CANVAS,
  IDS,
  LIFECYCLE_LABELS,
  animatedComposition,
  baseComposition,
  migrateCraftingTimerWidget,
  widgetComposition
};
