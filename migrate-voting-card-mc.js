#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const IDS = {
  parent: "prefab-voting-card-mc",
  art: "prefab-voting-card-art-mc",
  answer: "prefab-voting-card-answer-mc",
  author: "prefab-voting-card-author-mc",
  voters: "prefab-voting-card-voters-mc",
  voteCount: "prefab-voting-card-vote-count-mc",
  correctness: "prefab-voting-card-correctness-state"
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function componentById(composition, id) {
  return (composition?.components || []).find((component) => component.id === id) || null;
}

function baseComponent(component, patch) {
  return {
    ...clone(component || {}),
    opacity: Number.isFinite(Number(component?.opacity)) ? Number(component.opacity) : 1,
    visible: component?.visible !== false,
    editorHidden: false,
    transformOrigin: "center",
    locked: false,
    ...patch
  };
}

function lifecycleTimeline(vipTimeline, tracks = []) {
  const source = clone(vipTimeline || {});
  const sourceTrack = source.tracks?.[0] || null;
  source.tracks = tracks.map((target) => ({
    id: `track-${target.id}`,
    targetId: target.id,
    keyframes: (sourceTrack?.keyframes || []).map((keyframe) => ({
      ...clone(keyframe),
      id: `key-${target.id}-${keyframe.frame}`,
      props: {
        ...clone(keyframe.props || {}),
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height
      }
    }))
  }));
  return source;
}

function reference(id, name, instanceLabel, artCompositionId, x, y, width, height, defaultAnimationState = "Park") {
  return baseComponent(null, {
    id,
    name,
    instanceLabel,
    kind: "reference",
    x,
    y,
    width,
    height,
    scale: 1,
    rotation: 0,
    defaultAnimationState,
    artCompositionId
  });
}

function prefab(name, description, canvas, components, timeline) {
  return {
    name,
    description,
    surface: "stage",
    compositionKind: "prefab",
    isCustom: true,
    timelineArchitectureVersion: 2,
    canvas,
    components,
    timeline,
    updatedAt: new Date().toISOString()
  };
}

function migrateVotingCardManifest(manifest) {
  const compositions = manifest?.compositions || {};
  const legacy = compositions["voting-card"] || { canvas: { width: 560, height: 230 }, components: [] };
  const vipTimeline = compositions["prefab-vip-mc"]?.timeline;
  if (!vipTimeline) throw new Error("prefab-vip-mc timeline is required as the lifecycle template");

  const cardSurface = baseComponent(componentById(legacy, "current-card"), {
    id: "voting-card-surface",
    name: "Voting Card Surface",
    instanceLabel: "cardSurface",
    kind: "shape",
    x: 280,
    y: 86,
    width: 520,
    height: 150,
    defaultAnimationState: "On"
  });
  const answerText = baseComponent(componentById(legacy, "answer-text"), {
    id: "voting-card-answer-text",
    name: "Voting Card Answer Text",
    instanceLabel: "answerText",
    kind: "text",
    x: 210,
    y: 39,
    width: 420,
    height: 78,
    defaultAnimationState: "On"
  });
  const authorText = baseComponent(componentById(legacy, "author-heading"), {
    id: "voting-card-author-text",
    name: "Voting Card Author Text",
    instanceLabel: "authorText",
    kind: "text",
    x: 170,
    y: 14,
    width: 340,
    height: 28,
    defaultAnimationState: "On"
  });
  const voteCount = baseComponent(componentById(legacy, "vote-count"), {
    id: "voting-card-vote-count",
    name: "Voting Card Vote Count",
    instanceLabel: "voteCountText",
    x: 24,
    y: 24,
    width: 48,
    height: 48,
    defaultAnimationState: "On"
  });
  const voterContainer = baseComponent(componentById(legacy, "voter-container"), {
    id: "voting-card-voter-container",
    name: "Voting Card Voter Container",
    instanceLabel: "voterContainer",
    kind: "container",
    x: 250,
    y: 24,
    width: 500,
    height: 48,
    defaultAnimationState: "On"
  });
  const voteWidget = baseComponent(componentById(legacy, "vote-widget"), {
    id: "voting-card-vote-widget",
    name: "Voting Card Vote Widget",
    instanceLabel: "voteWidget",
    x: 250,
    y: 24,
    width: 112,
    height: 32,
    defaultText: "PLAYER",
    defaultAnimationState: "Park"
  });
  voterContainer.children = [voteWidget];

  const correctSurface = baseComponent(cardSurface, {
    id: "voting-card-correct-surface",
    name: "Voting Card Correct Surface",
    instanceLabel: "correctSurface",
    x: 260,
    y: 75,
    width: 520,
    height: 150,
    fillColor: "#60d394",
    defaultAnimationState: "On"
  });
  const correctnessTimeline = {
    fps: 30,
    frameCount: 2,
    labels: [{ name: "Neutral", frame: 0 }, { name: "Correct", frame: 1 }],
    commandFrames: [0, 1],
    commands: [
      { id: "stop-0", frame: 0, type: "stop" },
      { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
      { id: "stop-1", frame: 1, type: "stop" },
      { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" }
    ],
    tracks: [
      {
        id: "track-voting-card-correct-surface",
        targetId: "voting-card-correct-surface",
        keyframes: [
          { id: "key-voting-card-correct-surface-0", frame: 0, props: { x: 260, y: 75, width: 520, height: 150, scale: 1, rotation: 0, opacity: 1, visible: false, fillColor: "#60d394" }, easing: "hold" },
          { id: "key-voting-card-correct-surface-1", frame: 1, props: { x: 260, y: 75, width: 520, height: 150, scale: 1, rotation: 0, opacity: 1, visible: true, fillColor: "#60d394" }, easing: "hold" }
        ]
      }
    ]
  };

  const correctnessReference = reference(
    "voting-card-correctness-state",
    "Voting Card Correctness State",
    "correctnessState",
    IDS.correctness,
    280,
    86,
    520,
    150,
    "Neutral"
  );

  const parentComponents = [
    reference("voting-card-art-mc", "Voting Card Art MC", "cardArt", IDS.art, 280, 115, 560, 230),
    reference("voting-card-answer-mc", "Voting Card Answer MC", "answer", IDS.answer, 280, 86, 420, 78),
    reference("voting-card-author-mc", "Voting Card Author MC", "author", IDS.author, 280, 32, 340, 28),
    reference("voting-card-voters-mc", "Voting Card Voters MC", "voters", IDS.voters, 278, 188, 500, 48),
    reference("voting-card-vote-count-mc", "Voting Card Vote Count MC", "voteCount", IDS.voteCount, 30.927, 28, 48, 48)
  ];

  compositions[IDS.correctness] = prefab(
    "Voting Card Correctness State",
    "Stopped nested state used by cardArt.correctnessState to switch between Neutral and Correct.",
    { width: 520, height: 150 },
    [correctSurface],
    correctnessTimeline
  );
  compositions[IDS.art] = prefab(
    "Voting Card Art MC",
    "Card surface layer with a nested correctnessState timeline.",
    { width: 560, height: 230 },
    [cardSurface, correctnessReference],
    lifecycleTimeline(vipTimeline, [cardSurface, correctnessReference])
  );
  compositions[IDS.answer] = prefab(
    "Voting Card Answer MC",
    "Independently animated answer text child.",
    { width: 420, height: 78 },
    [answerText],
    lifecycleTimeline(vipTimeline, [answerText])
  );
  compositions[IDS.author] = prefab(
    "Voting Card Author MC",
    "Independently animated author reveal child.",
    { width: 340, height: 28 },
    [authorText],
    lifecycleTimeline(vipTimeline, [authorText])
  );
  compositions[IDS.voters] = prefab(
    "Voting Card Voters MC",
    "Independently animated voter container with a reusable vote widget template.",
    { width: 500, height: 48 },
    [voterContainer],
    lifecycleTimeline(vipTimeline, [voterContainer])
  );
  compositions[IDS.voteCount] = prefab(
    "Voting Card Vote Count MC",
    "Independently animated numeric vote-count child.",
    { width: 48, height: 48 },
    [voteCount],
    lifecycleTimeline(vipTimeline, [voteCount])
  );
  compositions[IDS.parent] = prefab(
    "Voting Card MC",
    "Voting card composite with labeled cardArt, answer, author, voters, and voteCount children.",
    { width: 560, height: 230 },
    parentComponents,
    lifecycleTimeline(vipTimeline, [])
  );

  manifest.compositions = compositions;
  const stageOrganization = manifest.organization?.stage;
  if (stageOrganization?.folderItems) {
    const craftingFolder = (stageOrganization.folders || []).find((folder) => folder.name === "Crafting Assets");
    if (craftingFolder?.id) {
      const items = stageOrganization.folderItems[craftingFolder.id] || [];
      const votingCardItems = [IDS.parent, IDS.art, IDS.answer, IDS.author, IDS.voters, IDS.voteCount, IDS.correctness].map(
        (compositionId) => `composition:${compositionId}`
      );
      stageOrganization.folderItems[craftingFolder.id] = [
        ...items.filter((item) => !votingCardItems.includes(item)),
        ...votingCardItems
      ];
    }
  }
  return manifest;
}

function run(argv = process.argv.slice(2)) {
  const filePath = path.resolve(argv[0] || "art-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  migrateVotingCardManifest(manifest);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Migrated voting-card MC compositions in ${filePath}\n`);
}

if (require.main === module) run();

module.exports = { IDS, lifecycleTimeline, migrateVotingCardManifest };
