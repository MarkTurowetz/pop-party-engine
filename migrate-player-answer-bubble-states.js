#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  bubble: "player-answer-bubble",
  text: "answer-text",
  card: "answer-bubble-card",
  tail: "answer-bubble-tail"
});

const STATE_NAMES = Object.freeze(["Default", "Correct", "Incorrect"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireComposition(compositions, id) {
  const composition = compositions[id];
  if (!composition) throw new Error(`${id} is required`);
  return composition;
}

function votingCardAnswerStateSource(compositions) {
  const entry = Object.entries(compositions).find(
    ([, composition]) => composition?.name === "Voting Card Answer Text"
  );
  if (!entry) throw new Error("Voting Card Answer Text is required as the state-color source");
  const [id, composition] = entry;
  const labels = new Map(
    (composition.timeline?.labels || []).map((label) => [label.name, Number(label.frame)])
  );
  for (const state of STATE_NAMES) {
    if (!labels.has(state)) throw new Error(`${id} requires a stopped ${state} state`);
  }
  const shape = (composition.components || []).find((component) => component.kind === "shape");
  const text = (composition.components || []).find((component) => component.kind === "text");
  if (!shape || !text) throw new Error(`${id} requires foreground text above a background shape`);
  const shapeTrack = (composition.timeline?.tracks || []).find(
    (track) => track.targetId === shape.id
  );
  const textTrack = (composition.timeline?.tracks || []).find(
    (track) => track.targetId === text.id
  );
  if (!shapeTrack || !textTrack)
    throw new Error(`${id} requires authored shape and text state tracks`);
  const keyframeAt = (track, frame, state) => {
    const keyframe = (track.keyframes || []).find((item) => Number(item.frame) === frame);
    if (!keyframe) throw new Error(`${id} requires a ${state} keyframe at frame ${frame}`);
    return keyframe;
  };
  return STATE_NAMES.map((name) => {
    const frame = labels.get(name);
    const shapeKeyframe = keyframeAt(shapeTrack, frame, name);
    const textKeyframe = keyframeAt(textTrack, frame, name);
    const fillColor = String(shapeKeyframe.props?.fillColor || "").trim();
    const fontColor = String(textKeyframe.props?.fontColor || "").trim();
    if (!fillColor || !fontColor)
      throw new Error(`${id} requires fill and font colors for ${name}`);
    return { name, frame, fillColor, fontColor };
  });
}

function baseProps(component) {
  return {
    x: Number(component.x || 0),
    y: Number(component.y || 0),
    width: Number(component.width || 0),
    height: Number(component.height || 0),
    scale: Number(component.scale ?? 1),
    rotation: Number(component.rotation || 0),
    opacity: Number(component.opacity ?? 1),
    visible: component.visible !== false
  };
}

function stateProps(component, state) {
  if (component.kind === "text") {
    return {
      ...baseProps(component),
      defaultText: String(component.defaultText || ""),
      fontFamily: String(component.fontFamily || ""),
      fontSize: Number(component.fontSize || 0),
      fontColor: state.fontColor,
      autoFitText: component.autoFitText === true
    };
  }
  return {
    ...baseProps(component),
    fillColor: state.fillColor,
    borderColor: String(component.borderColor || ""),
    borderWidth: Number(component.borderWidth || 0),
    borderRadius: Number(component.borderRadius || 0)
  };
}

function stateTimeline(components, states) {
  return {
    fps: 30,
    frameCount: 3,
    labels: states.map((state, frame) => ({ name: state.name, frame })),
    commandFrames: [0, 1, 2],
    commands: states.map((state, frame) => ({ id: `stop-${frame}`, frame, type: "stop" })),
    tracks: components.map((component) => ({
      id: `track-${component.id}`,
      targetId: component.id,
      keyframes: states.map((state, frame) => ({
        id: `key-${component.id}-${frame}`,
        frame,
        props: stateProps(component, state),
        easing: "hold"
      }))
    }))
  };
}

function bubbleWrapperReference(compositions) {
  for (const composition of Object.values(compositions)) {
    const reference = (composition.components || []).find(
      (component) => component.kind === "reference" && component.artCompositionId === IDS.bubble
    );
    if (reference) return reference;
  }
  throw new Error("Player Answer Bubble requires a lifecycle wrapper reference");
}

function migratePlayerAnswerBubbleStates(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest);
  const compositions = manifest.compositions || {};
  const bubble = requireComposition(compositions, IDS.bubble);
  const states = votingCardAnswerStateSource(compositions);
  const componentsById = new Map(
    (bubble.components || []).map((component) => [component.id, component])
  );
  const components = [IDS.text, IDS.card, IDS.tail].map((id) => {
    const component = componentsById.get(id);
    if (!component) throw new Error(`${IDS.bubble}.${id} is required`);
    return {
      ...component,
      defaultAnimationState: "Default",
      ...(component.kind === "text"
        ? { fontColor: states[0].fontColor }
        : { fillColor: states[0].fillColor })
    };
  });

  compositions[IDS.bubble] = {
    ...bubble,
    description:
      "Base visual and semantic-state prefab for player answers; lifecycle animation lives in Player Answer Bubble MC.",
    components,
    timeline: stateTimeline(components, states),
    updatedAt
  };
  bubbleWrapperReference(compositions).defaultAnimationState = "Default";
  manifest.compositions = compositions;
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const migrated = migratePlayerAnswerBubbleStates(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(migrated, null, 2)}\n`);
  process.stdout.write(`Updated Player Answer Bubble semantic states in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = { IDS, STATE_NAMES, migratePlayerAnswerBubbleStates };
