#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  widget: "prefab-voting-card-mc",
  group: "prefab-voting-card-voters-mc",
  voterMc: "prefab-voting-card-voter-mc",
  voter: "prefab-voting-card-voter",
  lifecycleTemplate: "prefab-voting-card-vote-count-mc",
  container: "voting-card-voter-container",
  template: "voting-card-voter-mc",
  voterReference: "reference-voting-card-voter",
  text: "voting-card-voter-text",
  background: "voting-card-voter-background"
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireComposition(compositions, id) {
  const composition = compositions[id];
  if (!composition) throw new Error(`${id} is required`);
  return composition;
}

function componentDefaults(patch) {
  return {
    x: 56,
    y: 16,
    width: 112,
    height: 32,
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

function buildVoterBase(sourceTemplate, updatedAt) {
  const text = componentDefaults({
    id: IDS.text,
    name: "Player Name",
    instanceLabel: "playerName",
    kind: "text",
    defaultText: String(sourceTemplate?.defaultText || "PLAYER"),
    fontSize: Number(sourceTemplate?.fontSize || 15),
    autoFitText: sourceTemplate?.autoFitText !== false,
    fontColor: String(sourceTemplate?.fontColor || "#17131f"),
    fontFamily: String(sourceTemplate?.fontFamily || "ui-rounded, \"Avenir Next\", \"Trebuchet MS\", system-ui, sans-serif")
  });
  const background = componentDefaults({
    id: IDS.background,
    name: "Voter Background",
    instanceLabel: "background",
    kind: "shape",
    shapeStyle: String(sourceTemplate?.shapeStyle || "rounded"),
    fillColor: String(sourceTemplate?.fillColor || "#fff8d6"),
    fillCss: String(sourceTemplate?.fillCss || ""),
    borderColor: String(sourceTemplate?.borderColor || "#17131f"),
    borderWidth: Number(sourceTemplate?.borderWidth ?? 2),
    borderRadius: Number(sourceTemplate?.borderRadius ?? 999)
  });
  const track = (component, stateProps) => ({
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
        ...stateProps
      },
      easing: "hold"
    }]
  });

  return {
    name: "Voting Card Voter",
    description: "Base visual and state prefab for one named voter.",
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { width: 112, height: 32 },
    components: [text, background],
    timeline: {
      fps: 30,
      frameCount: 1,
      labels: [{ name: "Default", frame: 0 }, { name: "Park", frame: 0 }],
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

function lifecycleTimeline(sourceTimeline) {
  const timeline = clone(sourceTimeline);
  const sourceTrack = timeline?.tracks?.[0];
  if (!timeline || !sourceTrack) throw new Error(`${IDS.lifecycleTemplate} requires an authored lifecycle track`);
  timeline.tracks = [{
    ...sourceTrack,
    id: `track-${IDS.voterReference}`,
    targetId: IDS.voterReference,
    keyframes: (sourceTrack.keyframes || []).map((keyframe) => ({
      ...clone(keyframe),
      id: `key-${IDS.voterReference}-${keyframe.frame}`,
      props: {
        ...clone(keyframe.props || {}),
        x: 56,
        y: 16,
        width: 112,
        height: 32
      }
    }))
  }];
  return timeline;
}

function buildVoterMc(sourceTimeline, updatedAt) {
  return {
    name: "Voting Card Voter MC",
    description: "Lifecycle-animation wrapper for one spawned Voting Card Voter instance.",
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { width: 112, height: 32 },
    components: [componentDefaults({
      id: IDS.voterReference,
      name: "Voting Card Voter",
      instanceLabel: "votingCardVoter",
      kind: "reference",
      artCompositionId: IDS.voter
    })],
    timeline: lifecycleTimeline(sourceTimeline),
    updatedAt
  };
}

function gateTimeline() {
  return {
    fps: 30,
    frameCount: 2,
    labels: [{ name: "Off", frame: 0 }, { name: "Park", frame: 0 }, { name: "On", frame: 1 }],
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

function buildVotersGroup(sourceGroup, updatedAt) {
  const sourceContainer = (sourceGroup.components || []).find((component) => component.id === IDS.container) || {};
  return {
    ...sourceGroup,
    name: "Voting Card Voters MC",
    description: "Collection gate and horizontal spawn container for independently animated Voting Card Voter MC instances.",
    canvas: { width: 500, height: 48 },
    components: [{
      ...clone(sourceContainer),
      id: IDS.container,
      name: "Voting Card Voter Container",
      instanceLabel: "voterContainer",
      kind: "container",
      x: 250,
      y: 24,
      width: 500,
      height: 48,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      editorHidden: false,
      transformOrigin: "center",
      locked: false,
      defaultAnimationState: "",
      childDistribution: "horizontal",
      shapeStyle: "rectangle",
      fillColor: "transparent",
      fillCss: "",
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 0,
      children: [{
        id: IDS.template,
        name: "Voting Card Voter MC Template",
        instanceLabel: "voter",
        kind: "reference",
        x: 56,
        y: 16,
        width: 112,
        height: 32,
        scale: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        editorHidden: false,
        transformOrigin: "center",
        locked: false,
        defaultAnimationState: "Off",
        artCompositionId: IDS.voterMc
      }]
    }],
    timeline: gateTimeline(),
    updatedAt
  };
}

function addVotersToWidget(widget, updatedAt) {
  const voters = {
    id: "voting-card-voters-mc",
    name: "Voting Card Voters MC",
    instanceLabel: "voters",
    kind: "reference",
    x: 278,
    y: 188,
    width: 500,
    height: 48,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "Off",
    artCompositionId: IDS.group
  };
  const components = (widget.components || []).filter((component) =>
    component.id !== voters.id && component.artCompositionId !== IDS.group
  );
  const answerIndex = components.findIndex((component) => component.instanceLabel === "answer");
  components.splice(answerIndex >= 0 ? answerIndex : components.length, 0, voters);
  return {
    ...widget,
    description: "Compound voting-card widget with independently animated answer, author, vote-count, and spawned voter children.",
    components,
    updatedAt
  };
}

function organize(manifest) {
  const organization = manifest.organization?.stage;
  if (!organization?.folderItems) throw new Error("Stage organization is required");
  const folder = (organization.folders || []).find((item) => item.name === "Voting Card");
  if (!folder?.id) throw new Error("Voting Card folder is required");
  const moving = [IDS.voter, IDS.voterMc, IDS.group].map((id) => `composition:${id}`);
  const movingSet = new Set(moving);
  for (const [folderId, items] of Object.entries(organization.folderItems)) {
    organization.folderItems[folderId] = items.filter((item) => !movingSet.has(item));
  }
  const widgetItem = `composition:${IDS.widget}`;
  const items = organization.folderItems[folder.id] || [];
  const widgetIndex = items.indexOf(widgetItem);
  items.splice(widgetIndex >= 0 ? widgetIndex : items.length, 0, ...moving);
  organization.folderItems[folder.id] = items;
}

function assertNoBrokenReferences(manifest) {
  for (const [compositionId, composition] of Object.entries(manifest.compositions || {})) {
    const stack = [...(composition.components || [])];
    while (stack.length) {
      const component = stack.pop();
      if (component.kind === "reference" && !manifest.compositions[component.artCompositionId]) {
        throw new Error(`${compositionId}.${component.id} references missing ${component.artCompositionId}`);
      }
      stack.push(...(component.children || []));
    }
  }
}

function migrateVotingCardVotersWidget(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest);
  const compositions = manifest.compositions || {};
  const sourceGroup = requireComposition(compositions, IDS.group);
  const widget = requireComposition(compositions, IDS.widget);
  const lifecycleTemplate = requireComposition(compositions, IDS.lifecycleTemplate);
  const sourceContainer = (sourceGroup.components || []).find((component) => component.id === IDS.container);
  const sourceTemplate = (sourceContainer?.children || [])[0] || {};

  compositions[IDS.voter] = buildVoterBase(sourceTemplate, updatedAt);
  compositions[IDS.voterMc] = buildVoterMc(lifecycleTemplate.timeline, updatedAt);
  compositions[IDS.group] = buildVotersGroup(sourceGroup, updatedAt);
  compositions[IDS.widget] = addVotersToWidget(widget, updatedAt);
  manifest.compositions = compositions;
  organize(manifest);
  assertNoBrokenReferences(manifest);
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const migrated = migrateVotingCardVotersWidget(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(migrated, null, 2)}\n`);
  process.stdout.write(`Rebuilt Voting Card Voters hierarchy in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = { IDS, migrateVotingCardVotersWidget };
