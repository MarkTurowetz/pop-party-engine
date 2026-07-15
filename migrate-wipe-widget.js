#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  art: "wipe-art-mc",
  widget: "wipe-widget-mc",
  artReference: "wipe-art-reference"
});

const CANVAS = Object.freeze({ width: 1920, height: 1080 });
const COLORS = Object.freeze(["#22d3ee", "#ffe156", "#ff4fa3", "#60d394", "#ff9e2c", "#2458ff", "#7c3aed"]);
const LABELS = Object.freeze([
  { name: "Off", frame: 0 },
  { name: "Park", frame: 0 },
  { name: "On", frame: 1 },
  { name: "Appear", frame: 2 },
  { name: "Update", frame: 23 },
  { name: "Disappear", frame: 25 }
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function shapeComponent(index) {
  const height = 156;
  return {
    id: `wipe-strip-${index + 1}`,
    name: `Wipe Strip ${index + 1}`,
    instanceLabel: `wipeStrip${index + 1}`,
    kind: "shape",
    x: 960,
    y: Number((((index + 0.5) * CANVAS.height) / COLORS.length).toFixed(3)),
    width: 2112,
    height,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "On",
    shapeStyle: "rectangle",
    fillColor: COLORS[index],
    fillCss: "",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 0
  };
}

function pose(component, x) {
  return {
    x,
    y: component.y,
    width: component.width,
    height: component.height,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    fillColor: component.fillColor
  };
}

function keyframe(component, frame, x, easing, suffix = frame) {
  return {
    id: `key-${component.id}-${suffix}`,
    frame,
    props: pose(component, x),
    easing
  };
}

function stripTrack(component, index) {
  const appearStart = 2 + index;
  const appearEnd = 16 + index;
  const disappearStart = 25 + index;
  const disappearEnd = 39 + index;
  const keyframes = [
    keyframe(component, 0, -1152, "hold", "off"),
    keyframe(component, 1, 960, "hold", "on"),
    keyframe(component, 2, -1152, index === 0 ? "easeOut" : "hold", "appear-base")
  ];
  if (index > 0) keyframes.push(keyframe(component, appearStart, -1152, "easeOut", "appear-start"));
  keyframes.push(
    keyframe(component, appearEnd, 960, "hold", "appear-end"),
    keyframe(component, 23, 960, "hold", "update"),
    keyframe(component, 24, 960, "hold", "update-end"),
    keyframe(component, 25, 960, index === 0 ? "easeIn" : "hold", "disappear-base")
  );
  if (index > 0) keyframes.push(keyframe(component, disappearStart, 960, "easeIn", "disappear-start"));
  keyframes.push(keyframe(component, disappearEnd, 3072, "hold", "disappear-end"));
  return { id: `track-${component.id}`, targetId: component.id, keyframes };
}

function lifecycleCommands({ compound = false } = {}) {
  const commands = [
    { id: "stop-0", frame: 0, type: "stop" },
    { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
    { id: "stop-1", frame: 1, type: "stop" },
    { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" },
    { id: "setvisible-2-true", frame: 2, type: "setVisible", target: "true" },
    { id: "stop-22", frame: 22, type: "stop" },
    { id: "setvisible-23-true", frame: 23, type: "setVisible", target: "true" },
    { id: "stop-24", frame: 24, type: "stop" },
    { id: "setvisible-25-true", frame: 25, type: "setVisible", target: "true" },
    { id: "stop-45", frame: 45, type: "stop" },
    { id: "setvisible-45-false", frame: 45, type: "setVisible", target: "false" }
  ];
  if (!compound) return commands;
  return [
    { id: "stop-0", frame: 0, type: "stop" },
    { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
    { id: "wipe-art-off", frame: 0, type: "stopComponent", target: IDS.artReference, event: "Off" },
    { id: "stop-1", frame: 1, type: "stop" },
    { id: "wipe-art-on", frame: 1, type: "stopComponent", target: IDS.artReference, event: "On" },
    { id: "wipe-art-appear", frame: 2, type: "playComponent", target: IDS.artReference, event: "Appear" },
    { id: "stop-22", frame: 22, type: "stop" },
    { id: "wipe-art-update", frame: 23, type: "playComponent", target: IDS.artReference, event: "Update" },
    { id: "stop-24", frame: 24, type: "stop" },
    { id: "wipe-art-disappear", frame: 25, type: "playComponent", target: IDS.artReference, event: "Disappear" },
    { id: "stop-45", frame: 45, type: "stop" },
    { id: "setvisible-45-false", frame: 45, type: "setVisible", target: "false" }
  ];
}

function wipeArtComposition(updatedAt) {
  const components = COLORS.map((_, index) => shapeComponent(index));
  return {
    name: "Wipe Art MC",
    description: "Animated colored-strip surface used by the compound Wipe Widget MC.",
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { ...CANVAS },
    components,
    timeline: {
      fps: 30,
      frameCount: 46,
      labels: clone(LABELS),
      commandFrames: [0, 1, 2, 22, 23, 24, 25, 45],
      commands: lifecycleCommands(),
      tracks: components.map(stripTrack)
    },
    updatedAt
  };
}

function wipeWidgetComposition(updatedAt) {
  return {
    name: "Wipe Widget MC",
    description: "Compound stage wipe whose authored parent timeline owns Set Wipe Shown completion callbacks.",
    surface: "stage",
    compositionKind: "gameObject",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { ...CANVAS },
    components: [
      {
        id: IDS.artReference,
        name: "Wipe Art MC",
        instanceLabel: "wipeArtMC",
        kind: "reference",
        x: 960,
        y: 540,
        width: 1920,
        height: 1080,
        scale: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        editorHidden: false,
        transformOrigin: "center",
        locked: false,
        defaultAnimationState: "Off",
        artCompositionId: IDS.art
      }
    ],
    timeline: {
      fps: 30,
      frameCount: 46,
      labels: clone(LABELS),
      commandFrames: [0, 1, 2, 22, 23, 24, 25, 45],
      commands: lifecycleCommands({ compound: true }),
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
  for (const id of [IDS.art, IDS.widget]) {
    const key = `composition:${id}`;
    if (!items.includes(key)) items.push(key);
  }
}

function migrateWipeWidget(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest) || {};
  manifest.compositions ||= {};
  manifest.compositions[IDS.art] = wipeArtComposition(updatedAt);
  manifest.compositions[IDS.widget] = wipeWidgetComposition(updatedAt);
  addToGlobalAssets(manifest);
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art/art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  fs.writeFileSync(filePath, `${JSON.stringify(migrateWipeWidget(manifest), null, 2)}\n`);
  process.stdout.write(`Added Wipe Widget MC lifecycle art to ${filePath}\n`);
}

if (require.main === module) run();

module.exports = { CANVAS, COLORS, IDS, LABELS, migrateWipeWidget, wipeArtComposition, wipeWidgetComposition };
