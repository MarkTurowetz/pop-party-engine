#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  container: "prefab-voting-card-mc",
  answer: "prefab-untitled-prefab-3",
  author: "prefab-voting-card-author-mc",
  authorBase: "prefab-voting-card-author-text",
  voteBase: "prefab-voting-card-vote",
  voteWrapper: "prefab-voting-card-vote-count-mc",
  answerBase: "prefab-untitled-prefab",
  background: "prefab-voting-card-bg"
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireComposition(compositions, id) {
  const composition = compositions[id];
  if (!composition) throw new Error(`${id} is required to repair Voting Card Widget MC`);
  return composition;
}

function baseComponent(patch) {
  return {
    x: 24,
    y: 24,
    width: 48,
    height: 48,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "Default",
    ...patch
  };
}

function voteBase(updatedAt) {
  const text = baseComponent({
    id: "voting-card-vote-count-text",
    name: "Vote Count Text",
    instanceLabel: "voteCountText",
    kind: "text",
    defaultText: "1",
    fontSize: 24,
    autoFitText: true,
    fontColor: "#17131f",
    fontFamily: "ui-rounded, \"Avenir Next\", \"Trebuchet MS\", system-ui, sans-serif"
  });
  const background = baseComponent({
    id: "voting-card-vote-background",
    name: "Vote Count Background",
    instanceLabel: "background",
    kind: "shape",
    shapeStyle: "circle",
    fillColor: "#fff8d6",
    fillCss: "",
    borderColor: "#17131f",
    borderWidth: 2,
    borderRadius: 999
  });
  const track = (component, props) => ({
    id: `track-${component.id}`,
    targetId: component.id,
    keyframes: [{
      id: `key-${component.id}-0`,
      frame: 0,
      props: {
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
        scale: component.scale,
        rotation: component.rotation,
        opacity: component.opacity,
        ...props
      },
      easing: "hold"
    }]
  });

  return {
    name: "Voting Card Vote",
    description: "Base visual and state prefab for the circular voting-card vote count.",
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { width: 48, height: 48 },
    components: [text, background],
    timeline: {
      fps: 30,
      frameCount: 1,
      labels: [
        { name: "Default", frame: 0 },
        { name: "Park", frame: 0 }
      ],
      commandFrames: [0],
      commands: [{ id: "stop-0", frame: 0, type: "stop" }],
      tracks: [
        track(text, {
          defaultText: text.defaultText,
          fontFamily: text.fontFamily,
          fontSize: text.fontSize,
          fontColor: text.fontColor,
          autoFitText: text.autoFitText
        }),
        track(background, {
          fillColor: background.fillColor,
          borderColor: background.borderColor,
          borderWidth: background.borderWidth,
          borderRadius: background.borderRadius
        })
      ]
    },
    updatedAt
  };
}

function widgetReference(id, name, instanceLabel, artCompositionId, geometry) {
  return {
    id,
    name,
    instanceLabel,
    kind: "reference",
    ...geometry,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "Off",
    artCompositionId
  };
}

function widgetGateTimeline() {
  return {
    fps: 30,
    frameCount: 2,
    labels: [
      { name: "Off", frame: 0 },
      { name: "Park", frame: 0 },
      { name: "On", frame: 1 }
    ],
    commandFrames: [0, 1],
    commands: [
      { id: "stop-0", frame: 0, type: "stop" },
      { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
      { id: "stop-1", frame: 1, type: "stop" },
      { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" }
    ],
    tracks: []
  };
}

function repairVoteWrapper(wrapper, updatedAt) {
  const reference = (wrapper.components || []).find((component) => component.kind === "reference") || {};
  return {
    ...wrapper,
    components: [{
      ...reference,
      id: "reference-voting-card-vote",
      name: "Voting Card Vote",
      instanceLabel: "votingCardVote",
      kind: "reference",
      x: 24,
      y: 24,
      width: 48,
      height: 48,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      editorHidden: false,
      transformOrigin: "center",
      locked: false,
      defaultAnimationState: "Default",
      artCompositionId: IDS.voteBase
    }],
    timeline: {
      ...clone(wrapper.timeline),
      tracks: (wrapper.timeline?.tracks || []).map((track) => ({
        ...clone(track),
        id: "track-reference-voting-card-vote",
        targetId: "reference-voting-card-vote",
        keyframes: (track.keyframes || []).map((keyframe) => ({
          ...clone(keyframe),
          id: `key-reference-voting-card-vote-${keyframe.frame}`
        }))
      }))
    },
    updatedAt
  };
}

function votingCardWidget(container, updatedAt) {
  return {
    ...container,
    name: "Voting Card Widget MC",
    description: "Compound voting-card widget with independently animated answer, author, and vote-count children.",
    canvas: { width: 560, height: 230 },
    components: [
      widgetReference(
        "voting-card-answer-mc",
        "Voting Card Answer",
        "answer",
        IDS.answer,
        { x: 280, y: 115, width: 560, height: 230 }
      ),
      widgetReference(
        "voting-card-author-mc",
        "Voting Card Author MC",
        "author",
        IDS.author,
        { x: 280, y: 32, width: 340, height: 28 }
      ),
      widgetReference(
        "voting-card-vote-count-mc",
        "Voting Card Vote Count MC",
        "voteCount",
        IDS.voteWrapper,
        { x: 30.927, y: 28, width: 48, height: 48 }
      )
    ],
    timeline: widgetGateTimeline(),
    updatedAt
  };
}

function organizeVotingCardFolder(manifest) {
  const organization = manifest.organization?.stage;
  if (!organization?.folderItems) throw new Error("Stage organization is required");
  const folder = (organization.folders || []).find((item) => item.name === "Voting Card");
  if (!folder?.id) throw new Error("Voting Card folder is required");

  const orderedIds = [
    IDS.background,
    IDS.answerBase,
    IDS.answer,
    IDS.voteBase,
    IDS.voteWrapper,
    IDS.authorBase,
    IDS.author,
    IDS.container
  ];
  const orderedItems = orderedIds
    .filter((id) => manifest.compositions[id])
    .map((id) => `composition:${id}`);
  const movingItems = new Set(orderedItems);

  for (const [folderId, items] of Object.entries(organization.folderItems)) {
    organization.folderItems[folderId] = items.filter((item) => !movingItems.has(item));
  }

  const existing = organization.folderItems[folder.id] || [];
  const withoutEmptyUntitled = existing.filter((item) => {
    const id = item.replace(/^composition:/, "");
    const composition = manifest.compositions[id];
    return !(composition?.name === "Untitled Prefab" && (composition.components || []).length === 0);
  });
  organization.folderItems[folder.id] = [...withoutEmptyUntitled, ...orderedItems];
}

function assertNoBrokenReferences(manifest) {
  for (const [compositionId, composition] of Object.entries(manifest.compositions || {})) {
    for (const component of composition.components || []) {
      if (component.kind === "reference" && !manifest.compositions[component.artCompositionId]) {
        throw new Error(`${compositionId}.${component.id} references missing ${component.artCompositionId}`);
      }
    }
  }
}

function repairVotingCardWidget(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest);
  const compositions = manifest.compositions || {};
  const container = requireComposition(compositions, IDS.container);
  const answer = requireComposition(compositions, IDS.answer);
  const author = requireComposition(compositions, IDS.author);
  const authorBase = requireComposition(compositions, IDS.authorBase);
  const voteWrapper = requireComposition(compositions, IDS.voteWrapper);
  if (!answer.components?.length || !author.components?.length || !authorBase.components?.length) {
    throw new Error("Authored Answer and Author widget layers must not be empty");
  }

  compositions[IDS.voteBase] = voteBase(updatedAt);
  compositions[IDS.voteWrapper] = repairVoteWrapper(voteWrapper, updatedAt);
  compositions[IDS.container] = votingCardWidget(container, updatedAt);
  manifest.compositions = compositions;
  organizeVotingCardFolder(manifest);
  assertNoBrokenReferences(manifest);
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const repaired = repairVotingCardWidget(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(repaired, null, 2)}\n`);
  process.stdout.write(`Repaired Voting Card Widget MC hierarchy in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = { IDS, repairVotingCardWidget };
