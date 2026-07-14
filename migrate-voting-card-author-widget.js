#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = Object.freeze({
  base: "prefab-voting-card-author-text",
  wrapper: "prefab-voting-card-author-mc",
  container: "prefab-voting-card-mc",
  baseText: "voting-card-author-text-content",
  wrapperReference: "reference-voting-card-author-text",
  containerReference: "voting-card-author-mc"
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertComposition(compositions, id) {
  const composition = compositions[id];
  if (!composition) throw new Error(`${id} is required`);
  return composition;
}

function authorTextComponent(source) {
  return {
    ...clone(source),
    id: IDS.baseText,
    name: "Author Text",
    instanceLabel: "authorText",
    kind: "text",
    x: 170,
    y: 14,
    width: 340,
    height: 28,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "Default"
  };
}

function baseStateTimeline(component) {
  const props = {
    x: component.x,
    y: component.y,
    width: component.width,
    height: component.height,
    scale: component.scale,
    rotation: component.rotation,
    opacity: component.opacity
  };
  for (const key of ["defaultText", "fontFamily", "fontSize", "fontColor", "autoFitText"]) {
    if (component[key] !== undefined) props[key] = component[key];
  }
  return {
    fps: 30,
    frameCount: 1,
    labels: [
      { name: "Default", frame: 0 },
      { name: "Park", frame: 0 }
    ],
    commandFrames: [0],
    commands: [{ id: "stop-0", frame: 0, type: "stop" }],
    tracks: [{
      id: `track-${component.id}`,
      targetId: component.id,
      keyframes: [{
        id: `key-${component.id}-0`,
        frame: 0,
        props,
        easing: "hold"
      }]
    }]
  };
}

function authorReference() {
  return {
    id: IDS.wrapperReference,
    name: "Voting Card Author Text",
    instanceLabel: "votingCardAuthorText",
    kind: "reference",
    x: 170,
    y: 14,
    width: 340,
    height: 28,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "Default",
    artCompositionId: IDS.base
  };
}

function retargetLifecycleTimeline(sourceTimeline, reference) {
  const timeline = clone(sourceTimeline);
  const sourceTrack = timeline?.tracks?.[0];
  if (!timeline || !sourceTrack) throw new Error(`${IDS.wrapper} must have an authored lifecycle track`);
  timeline.tracks = [{
    ...sourceTrack,
    id: `track-${reference.id}`,
    targetId: reference.id,
    keyframes: (sourceTrack.keyframes || []).map((keyframe) => ({
      ...keyframe,
      id: `key-${reference.id}-${keyframe.frame}`,
      props: {
        ...keyframe.props,
        x: reference.x,
        y: reference.y,
        width: reference.width,
        height: reference.height
      }
    }))
  }];
  return timeline;
}

function ensureContainerAuthor(components) {
  const existingIndex = components.findIndex((component) =>
    component.id === IDS.containerReference || component.artCompositionId === IDS.wrapper
  );
  const existing = existingIndex >= 0 ? components[existingIndex] : null;
  const author = {
    ...clone(existing || {}),
    id: IDS.containerReference,
    name: "Voting Card Author MC",
    instanceLabel: "author",
    kind: "reference",
    x: 280,
    y: 32,
    width: 340,
    height: 28,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    defaultAnimationState: "Off",
    artCompositionId: IDS.wrapper
  };
  const withoutAuthor = components.filter((component) =>
    component.id !== IDS.containerReference && component.artCompositionId !== IDS.wrapper
  );
  const insertionIndex = existingIndex >= 0 ? existingIndex : Math.min(1, withoutAuthor.length);
  withoutAuthor.splice(insertionIndex, 0, author);
  return withoutAuthor;
}

function organizeBaseNextToWrapper(manifest) {
  const organization = manifest.organization?.stage;
  if (!organization?.folderItems) return;
  const baseItem = `composition:${IDS.base}`;
  const wrapperItem = `composition:${IDS.wrapper}`;
  let inserted = false;

  for (const [folderId, sourceItems] of Object.entries(organization.folderItems)) {
    const items = sourceItems.filter((item) => item !== baseItem);
    const wrapperIndex = items.indexOf(wrapperItem);
    if (!inserted && wrapperIndex >= 0) {
      items.splice(wrapperIndex, 0, baseItem);
      inserted = true;
    }
    organization.folderItems[folderId] = items;
  }

  if (inserted) return;
  const craftingFolder = (organization.folders || []).find((folder) => folder.name === "Crafting Assets");
  if (!craftingFolder?.id) return;
  const items = organization.folderItems[craftingFolder.id] || [];
  organization.folderItems[craftingFolder.id] = [...items, baseItem, wrapperItem];
}

function migrateVotingCardAuthorWidget(sourceManifest, updatedAt = new Date().toISOString()) {
  const manifest = clone(sourceManifest);
  const compositions = manifest.compositions || {};
  const wrapper = assertComposition(compositions, IDS.wrapper);
  const container = assertComposition(compositions, IDS.container);
  const sourceText = (wrapper.components || []).find((component) => component.kind === "text")
    || compositions[IDS.base]?.components?.find((component) => component.kind === "text");
  if (!sourceText) throw new Error(`${IDS.wrapper} must contain an author text layer before migration`);

  const text = authorTextComponent(sourceText);
  const reference = authorReference();
  compositions[IDS.base] = {
    name: "Voting Card Author Text",
    description: "Base visual and semantic-state prefab for voting-card author text.",
    surface: wrapper.surface || "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas: { width: 340, height: 28 },
    components: [text],
    timeline: baseStateTimeline(text),
    updatedAt
  };
  compositions[IDS.wrapper] = {
    ...wrapper,
    name: "Voting Card Author MC",
    description: "Lifecycle-animation wrapper for the nested Voting Card Author Text prefab.",
    canvas: { width: 340, height: 28 },
    components: [reference],
    timeline: retargetLifecycleTimeline(wrapper.timeline, reference),
    updatedAt
  };
  compositions[IDS.container] = {
    ...container,
    components: ensureContainerAuthor(container.components || []),
    updatedAt
  };
  manifest.compositions = compositions;
  organizeBaseNextToWrapper(manifest);
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const migrated = migrateVotingCardAuthorWidget(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(migrated, null, 2)}\n`);
  process.stdout.write(`Rebuilt Voting Card Author widget hierarchy in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = {
  IDS,
  migrateVotingCardAuthorWidget
};
