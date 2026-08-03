"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");
const { refreshLocalContentBundle } = require("../packages/engine/src/server/local-content-bundle-writer");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "packages", "create-game");
const enginePackageRoot = path.join(root, "packages", "engine");
const engineVersion = JSON.parse(fs.readFileSync(path.join(enginePackageRoot, "package.json"), "utf8")).version;
const playwrightModulePath = require.resolve("playwright");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-create-game-"));

try {
  const packOutput = JSON.parse(execFileSync("npm", ["pack", packageRoot, "--json", "--pack-destination", fixtureRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  }));
  const packed = packOutput[0];
  if (!packed?.filename) throw new Error("npm pack did not return a create-game tarball");
  if (!packed.files.some((file) => file.path === "bin/create-game.js")) throw new Error("create-game tarball is missing its CLI");
  if (!packed.files.some((file) => file.path === "starter/content/content-bundle.json")) throw new Error("create-game tarball is missing canonical starter content");
  if (!packed.files.some((file) => file.path === "starter/ASSET-NOTICES.json")) throw new Error("create-game tarball is missing starter asset notices");
  const tarball = path.join(fixtureRoot, packed.filename);
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), `${JSON.stringify({ name: "create-game-pack-fixture", private: true }, null, 2)}\n`);
  execFileSync("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: fixtureRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  const packedCli = path.join(fixtureRoot, "node_modules", "@pop-party", "create-game", "bin", "create-game.js");
  const cliTargetRoot = path.join(fixtureRoot, "cli-generated-game");
  const cliOutput = execFileSync(process.execPath, [packedCli, "CLI Generated Fixture", "--engine-version", engineVersion, "--output", cliTargetRoot], {
    cwd: fixtureRoot,
    encoding: "utf8"
  });
  if (!cliOutput.includes(`Created CLI Generated Fixture at ${cliTargetRoot}`)
    || !cliOutput.includes(`Engine: @pop-party/engine@${engineVersion}`)) {
    throw new Error("Packed create-game executable output contract failed");
  }
  if (JSON.parse(fs.readFileSync(path.join(cliTargetRoot, "package.json"), "utf8")).name !== "cli-generated-fixture") {
    throw new Error("Packed create-game executable did not generate the requested game");
  }
  const fixtureRequire = createRequire(path.join(fixtureRoot, "fixture.js"));
  const { generateGame } = fixtureRequire("@pop-party/create-game");
  const targetRoot = path.join(fixtureRoot, "generated-game");
  generateGame({ displayName: "Generated Fixture", engineVersion, targetRoot });
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(targetRoot, "package.json"), "utf8"));
  if (!fs.readFileSync(path.join(targetRoot, "LICENSE"), "utf8").startsWith("MIT License\n")) throw new Error("Generated game is missing its MIT code license");
  if (!fs.existsSync(path.join(targetRoot, "STARTER-ASSET-NOTICES.json"))) throw new Error("Generated game is missing starter asset notices");
  if (!fs.readFileSync(path.join(targetRoot, ".gitignore"), "utf8").includes(".pop-party/")) {
    throw new Error("Generated game does not ignore its local development content workspace");
  }
  const renderBlueprint = fs.readFileSync(path.join(targetRoot, "render.yaml"), "utf8");
  for (const contract of ["type: web", "runtime: node", "numInstances: 1", "startCommand: npm start", "healthCheckPath: /health"]) {
    if (!renderBlueprint.includes(contract)) throw new Error(`Generated Render Blueprint is missing ${contract}`);
  }
  if (!fs.existsSync(path.join(targetRoot, "DEPLOYMENT.md"))) throw new Error("Generated game is missing its deployment runbook");
  for (const relativePath of ["src/actions/index.js", "src/stage/index.js", "src/controller/index.js", "src/tools/index.js", "src/plugin/index.js", "tests/config.test.js"]) {
    if (!fs.existsSync(path.join(targetRoot, relativePath))) throw new Error(`Generated game is missing ${relativePath}`);
  }
  if (generatedManifest.dependencies?.["@pop-party/engine"] !== engineVersion) throw new Error("Generated game did not pin the exact engine version");
  if (generatedManifest.scripts?.start !== "pop-party start"
    || generatedManifest.scripts?.dev !== "pop-party dev"
    || generatedManifest.scripts?.migrate !== "pop-party migrate") {
    throw new Error("Generated game is missing engine-owned service and migration scripts");
  }
  if (JSON.stringify(generatedManifest).includes("file:") || JSON.stringify(generatedManifest).includes("workspace:")) {
    throw new Error("Generated game contains a local dependency reference");
  }
  let generatedSnapshot = createLocalContentBundleProvider({ root: path.join(targetRoot, "content") }).loadPublishedRevision();
  if (generatedSnapshot.manifest.gameId !== "generated-fixture") throw new Error("Packed generator did not create an independently identified bundle");
  const enginePackOutput = JSON.parse(execFileSync("npm", ["pack", enginePackageRoot, "--json", "--pack-destination", fixtureRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  }));
  const engineTarball = path.join(fixtureRoot, enginePackOutput[0].filename);
  execFileSync("npm", ["install", engineTarball, "--no-save", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: targetRoot,
    stdio: "pipe",
    env: { ...process.env, npm_config_cache: path.join(fixtureRoot, ".npm-cache") }
  });
  execFileSync("npm", ["test"], { cwd: targetRoot, stdio: "inherit" });
  fs.writeFileSync(path.join(targetRoot, "src", "actions", "index.js"), `"use strict";
module.exports = Object.freeze([{
  id: "generated-fixture.increment",
  value: {
    name: "Increment Fixture Counter",
    fields: [
      { key: "amount", label: "Amount", control: "integer", min: 1, max: 10, default: 1 },
      { key: "resultVariable", label: "Result Variable", control: "text", default: "fixtureCount" }
    ],
    outputs: [
      { id: "count", name: "Count", variableField: "resultVariable", defaultVariable: "fixtureCount" }
    ],
    execute(context, action) {
      context.state.count = Number(context.state.count || 0) + Number(action.amount || 0);
      context.outputs.set("count", context.state.count);
      context.broadcast.request();
    }
  }
}]);
`);
  fs.writeFileSync(path.join(targetRoot, "src", "inputs", "index.js"), `"use strict";
module.exports = Object.freeze([
  {
    id: "generated-fixture.turnChoice",
    value: {
      name: "Turn Choice",
      fields: [
        { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
        { key: "resultVariable", label: "Result Variable", control: "text", default: "inputResult" }
      ],
      outputs: [{ id: "choice", name: "Choice", variableField: "resultVariable" }],
      submission: [{ id: "choice", type: "choice", optionsSource: "options" }],
      controller: {
        layoutStateId: "fixture-plugin-input",
        bindings: [
          { id: "hit", kind: "choice", layoutElementId: "fixture-hit-button", field: "choice", optionIndex: 0, autoSubmit: true },
          { id: "stay", kind: "choice", layoutElementId: "fixture-stay-button", field: "choice", optionIndex: 1, autoSubmit: true }
        ]
      },
      recipients(context) { return context.players.slice(0, 1).map((player) => player.id); },
      view(context) {
        return { viewer: context.viewer.id, options: [{ id: "hit", label: "Hit" }, { id: "stay", label: "Stay" }] };
      },
      submit(context, payload) {
        context.state.turnChoice = { playerId: context.actor.id, choice: payload.choice };
        context.outputs.set("choice", payload.choice);
      }
    }
  },
  {
    id: "generated-fixture.privateWager",
    value: {
      name: "Private Wager",
      fields: [{ key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" }],
      submission: [
        { id: "side", type: "choice", optionsSource: "options" },
        { id: "amount", type: "integer", min: 1, max: 50 }
      ],
      controller: {
        layoutStateId: "controller-text-input",
        bindings: [
          { id: "left", kind: "choice", layoutElementId: "controllerTextPrompt", field: "side", optionIndex: 0 },
          { id: "right", kind: "choice", layoutElementId: "controllerInvalidBanner", field: "side", optionIndex: 1 },
          { id: "amount", kind: "integer", layoutElementId: "controllerTextInput", field: "amount" },
          { id: "submit", kind: "submit", layoutElementId: "controllerTextSubmitButtonContainer" }
        ],
        submitted: {
          layoutStateId: "fixture-wager-confirmed",
          bindings: [
            { id: "confirmedTarget", kind: "text", layoutElementId: "fixture-wager-confirmation", source: "target", targetComponentId: "text" }
          ]
        }
      },
      disconnect: "completeRemaining",
      recipients(context) { return context.players.map((player) => player.id); },
      view(context) {
        const target = context.viewer.name === "One" ? 10 : 20;
        return {
          target,
          options: [{ id: "over", label: "Over " + target }, { id: "under", label: "Under " + target }],
          amount: { initial: context.viewer.name === "One" ? 7 : 9 }
        };
      },
      submit(context, payload) {
        context.state.wagers ||= {};
        context.state.wagers[context.actor.id] = payload;
      }
    }
  },
  {
    id: "generated-fixture.gestureChoice",
    value: {
      name: "Gesture Choice",
      fields: [
        { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
        { key: "optionCount", label: "Option Count", control: "integer", min: 2, max: 4, default: 2 }
      ],
      submission: [
        { id: "choice", type: "choice", optionsSource: "options" },
        { id: "mode", type: "choice", optionsSource: "modes" }
      ],
      controller: {
        layoutStateId: "fixture-plugin-input",
        bindings: [
          { id: "gestureAlpha", kind: "choice", layoutElementId: "fixture-hit-button", field: "choice", optionIndex: 0, autoSubmit: true, submitValues: { mode: "tap" }, holdSubmit: { seconds: 1.5, submitValues: { mode: "hold" } } },
          { id: "gestureBeta", kind: "choice", layoutElementId: "fixture-stay-button", field: "choice", optionIndex: 1, autoSubmit: true, submitValues: { mode: "tap" }, holdSubmit: { seconds: 1.5, submitValues: { mode: "hold" } } },
          { id: "gestureGamma", kind: "choice", layoutElementId: "fixture-extra-button-three", field: "choice", optionIndex: 2, autoSubmit: true, submitValues: { mode: "tap" }, holdSubmit: { seconds: 1.5, submitValues: { mode: "hold" } } },
          { id: "gestureDelta", kind: "choice", layoutElementId: "fixture-extra-button-four", field: "choice", optionIndex: 3, autoSubmit: true, submitValues: { mode: "tap" }, holdSubmit: { seconds: 1.5, submitValues: { mode: "hold" } } }
        ],
        submitted: {
          layoutStateId: "fixture-gesture-confirmed",
          bindings: [
            { id: "confirmedViewer", kind: "text", layoutElementId: "fixture-gesture-confirmation", source: "viewerName", targetComponentId: "author-heading" },
            { id: "confirmedPrompt", kind: "text", layoutElementId: "fixture-gesture-confirmation", source: "prompt", targetComponentId: "answer-text" },
            { id: "confirmedDetail", kind: "text", layoutElementId: "fixture-gesture-confirmation", source: "detail", targetComponentId: "vote-count" }
          ]
        }
      },
      recipients(context) { return context.players.map((player) => player.id); },
      view(context, action) {
        const allOptions = [
          { id: "alpha", label: "Alpha" },
          { id: "beta", label: "Beta" },
          { id: "gamma", label: "Gamma" },
          { id: "delta", label: "Delta" }
        ];
        return {
          viewerName: context.viewer.name,
          prompt: "Private prompt for " + context.viewer.name,
          detail: "Detail " + context.viewer.id,
          options: allOptions.slice(0, Number(action.optionCount || 2)),
          modes: [{ id: "tap", label: "Tap" }, { id: "hold", label: "Hold" }]
        };
      },
      submit(context, payload) {
        context.state.gestures ||= {};
        context.state.gestures[context.actor.id] = payload;
      }
    }
  },
  {
    id: "generated-fixture.dynamicTargets",
    value: {
      name: "Dynamic Targets",
      fields: [
        { key: "answersSubmittedTargetActionId", label: "After Submit", control: "actionTarget", default: "none" },
        { key: "optionCount", label: "Option Count", control: "integer", min: 0, max: 8, default: 2 }
      ],
      submission: [{ id: "targetPlayerId", type: "choice", optionsSource: "targets" }],
      controller: {
        layoutStateId: "fixture-dynamic-targets",
        bindings: [{
          id: "targets",
          kind: "choiceCollection",
          layoutElementId: "fixture-target-collection",
          field: "targetPlayerId",
          item: {
            artCompositionId: "controller-text-input-field",
            targetComponentId: "placeholder-text",
            labelSource: "label",
            disabledSource: "disabled"
          },
          autoSubmit: true,
          holdSubmit: { seconds: 1.5, submitValues: {} }
        }]
      },
      recipients(context) { return context.players.slice(0, 2).map((player) => player.id); },
      view(context, action) {
        const requested = Math.max(0, Number(action.optionCount || 0));
        const count = context.viewer.name === "Two" ? Math.max(0, Math.min(requested, 2)) : requested;
        return {
          viewer: context.viewer.id,
          targets: Array.from({ length: count }, (_, index) => ({
            id: context.viewer.id + "-target-" + index,
            label: index === 2
              ? "A very long private target label for " + context.viewer.name + " number " + index
              : context.viewer.name + " target " + index,
            disabled: index === 5
          }))
        };
      },
      submit(context, payload) {
        context.state.dynamicTargets ||= {};
        context.state.dynamicTargets[context.actor.id] = payload.targetPlayerId;
      }
    }
  }
]);
`);
  const generatedRenderer = (id, layoutElementId, targetComponentId) => `"use strict";
module.exports = Object.freeze([{
  id: ${JSON.stringify(id)},
  value: {
    name: "Fixture Counter",
    target: { layoutElementId: ${JSON.stringify(layoutElementId)}, layoutScope: "global" },
    bindings: [
      { id: "count", kind: "text", source: "label", targetComponentId: ${JSON.stringify(targetComponentId)}, fallback: "0" }
    ],
    select(context) { return { label: String(context.state.count || 0) }; }
  }
}]);
`;
  fs.writeFileSync(path.join(targetRoot, "src", "stage", "index.js"), `"use strict";
const cardBindings = [
  { id: "label", kind: "text", source: "label", targetComponentId: "label", fallback: "PREVIEW CARD" },
  { id: "state", kind: "state", source: "state", playback: "play" }
];
function cards(count) {
  const base = [
    { id: "a", label: "ALPHA", state: count > 0 ? "Choosing End" : "Choosing Start" },
    { id: "b", label: "BETA", state: "On" },
    { id: "c", label: "GAMMA", state: "On" }
  ];
  if (count > 0) base.push({ id: "d", label: "DELTA", state: "Choosing Start" });
  return count % 2 ? base.slice().reverse() : base;
}
module.exports = Object.freeze([
  {
    id: "generated-fixture.stageCounter",
    value: {
      name: "Fixture Counter",
      target: { layoutElementId: "stagecodebadge", layoutScope: "global" },
      bindings: [{ id: "count", kind: "text", source: "label", targetComponentId: "badge-code", fallback: "0" }],
      select(context) { return { label: String(context.state.count || 0) }; }
    }
  },
  {
    id: "generated-fixture.stageHandRows",
    value: {
      name: "Fixture Nested Hand",
      target: { layoutElementId: "fixture-hand-rows", layoutScope: "global" },
      bindings: [{
        id: "rows", kind: "collection", source: "rows",
        item: {
          keySource: "id", artCompositionId: "fixture-hand-row", bindings: [
            { id: "rowState", kind: "state", source: "state", playback: "stop" },
            {
              id: "cards", kind: "collection", source: "cards", targetComponentId: "cards-slot",
              item: { keySource: "id", artCompositionId: "fixture-card", bindings: cardBindings }
            }
          ]
        }
      }],
      select(context) {
        const count = Number(context.flow.collectionCount || 0);
        const all = cards(count);
        return { rows: [
          { id: "top", state: "On", cards: all.filter((card) => card.id !== "c") },
          { id: "bottom", state: "On", cards: all.filter((card) => card.id === "c") }
        ] };
      }
    }
  },
  {
    id: "generated-fixture.stageFlatCards",
    value: {
      name: "Fixture Flat Hand",
      target: { layoutElementId: "fixture-flat-cards", layoutScope: "global" },
      bindings: [{ id: "cards", kind: "collection", source: "cards", item: { keySource: "id", artCompositionId: "fixture-card", bindings: cardBindings } }],
      select(context) { return { cards: cards(Number(context.flow.collectionCount || 0)) }; }
    }
  },
  {
    id: "generated-fixture.playerPresentations",
    value: {
      name: "Fixture Game-owned Player Presentations",
      target: { kind: "layout", layoutElementId: "fixture-players", layoutScope: "global" },
      bindings: [{
        id: "players", kind: "collection", source: "players",
        item: {
          keySource: "id", artCompositionId: "fixture-player-presentation", bindings: [
            { id: "name", kind: "text", source: "name", targetComponentId: "fixture-player-name" },
            { id: "score", kind: "text", source: "score", targetComponentId: "fixture-player-score" },
            { id: "state", kind: "state", source: "state", playback: "stop" },
            {
              id: "rows", kind: "collection", source: "rows", targetComponentId: "fixture-player-rows",
              item: {
                keySource: "id", artCompositionId: "fixture-hand-row", bindings: [{
                  id: "cards", kind: "collection", source: "cards", targetComponentId: "cards-slot",
                  item: { keySource: "id", artCompositionId: "fixture-card", bindings: cardBindings }
                }]
              }
            }
          ]
        }
      }],
      select(context) {
        const count = Number(context.flow.collectionCount || 0);
        const all = cards(count);
        const playerCards = count > 0
          ? [all.find((card) => card.id === "a"), all.find((card) => card.id === "d"), all.find((card) => card.id === "b")].filter(Boolean)
          : [all.find((card) => card.id === "a"), all.find((card) => card.id === "b")].filter(Boolean);
        return {
          players: context.players.map((player, index) => ({
            id: player.id,
            name: player.name,
            score: String((index + 1) * 10 + count),
            state: player.needsInput ? "Choosing Start" : "On",
            rows: [{ id: "main", cards: playerCards }]
          }))
        };
      }
    }
  },
  {
    id: "generated-fixture.stageHandRowsPreview",
    value: {
      name: "Fixture Nested Hand Preview",
      target: { layoutElementId: "fixture-preview-hand-rows", layoutScope: "moment" },
      bindings: [{
        id: "rows", kind: "collection", source: "rows",
        item: {
          keySource: "id", artCompositionId: "fixture-hand-row", bindings: [
            { id: "rowState", kind: "state", source: "state", playback: "stop" },
            {
              id: "cards", kind: "collection", source: "cards", targetComponentId: "cards-slot",
              item: { keySource: "id", artCompositionId: "fixture-card", bindings: cardBindings }
            }
          ]
        }
      }],
      select() { return { rows: [] }; }
    }
  },
  {
    id: "generated-fixture.stageFlatCardsPreview",
    value: {
      name: "Fixture Flat Hand Preview",
      target: { layoutElementId: "fixture-preview-flat-cards", layoutScope: "moment" },
      bindings: [{ id: "cards", kind: "collection", source: "cards", item: { keySource: "id", artCompositionId: "fixture-card", bindings: cardBindings } }],
      select() { return { cards: [] }; }
    }
  }
]);
`);
  fs.writeFileSync(
    path.join(targetRoot, "src", "controller", "index.js"),
    generatedRenderer("generated-fixture.controllerCounter", "controllerglobalactionmessage", "layout-text-field-text/layout-text")
  );
  const stageLayoutPath = path.join(targetRoot, "content", "layouts", "stage.json");
  const stageLayouts = JSON.parse(fs.readFileSync(stageLayoutPath, "utf8"));
  const rendererCollectionLayoutElements = [
    {
      id: "fixture-hand-rows", name: "Fixture Nested Hand", selector: "", kind: "collection", artCompositionId: "",
      hidden: false, locked: false, x: 560, y: 420, width: 700, height: 360, scale: 1, rotation: 0,
      collectionDirection: "vertical", collectionGap: 20, collectionDistribution: "center", collectionAlignment: "center",
      collectionPadding: 12, collectionOverflow: "hidden", zIndex: 30
    },
    {
      id: "fixture-flat-cards", name: "Fixture Flat Hand", selector: "", kind: "collection", artCompositionId: "",
      hidden: false, locked: false, x: 1360, y: 420, width: 700, height: 180, scale: 1, rotation: 0,
      collectionDirection: "horizontal", collectionGap: 18, collectionDistribution: "center", collectionAlignment: "center",
      collectionPadding: 10, collectionOverflow: "visible", zIndex: 31
    },
    {
      id: "fixture-players", name: "Fixture Players", selector: "", kind: "collection", artCompositionId: "",
      hidden: false, locked: false, x: 960, y: 850, width: 1320, height: 220, scale: 1, rotation: 0,
      collectionDirection: "horizontal", collectionGap: 24, collectionDistribution: "space-evenly", collectionAlignment: "center",
      collectionPadding: 10, collectionOverflow: "visible", zIndex: 32
    }
  ];
  stageLayouts.global.elements.push(...structuredClone(rendererCollectionLayoutElements));
  const introLayoutTextField = stageLayouts.states
    .find((state) => state.id === "intro")?.elements
    .find((element) => element.id === "layout-text-field-instance-1");
  if (introLayoutTextField) introLayoutTextField.autoFitText = true;
  stageLayouts.states.push({
    id: "fixture-renderer-preview",
    name: "Fixture Renderer Preview",
    elements: structuredClone(rendererCollectionLayoutElements.slice(0, 2)).map((element) => ({
      ...element,
      id: element.id === "fixture-hand-rows" ? "fixture-preview-hand-rows" : "fixture-preview-flat-cards"
    }))
  });
  fs.writeFileSync(stageLayoutPath, `${JSON.stringify(stageLayouts, null, 2)}\n`);
  const artManifestPath = path.join(targetRoot, "content", "art", "manifest.json");
  const artManifest = JSON.parse(fs.readFileSync(artManifestPath, "utf8"));
  const nestedLayoutTextComposition = artManifest.compositions["prefab-layout-text-field-text"];
  const nestedLayoutTextComponent = nestedLayoutTextComposition?.components
    ?.find((component) => component.id === "text" || component.instanceLabel === "text");
  if (nestedLayoutTextComponent) nestedLayoutTextComponent.autoFitText = true;
  const fixtureVisibleTimeline = {
    fps: 30,
    frameCount: 4,
    labels: [
      { name: "Off", frame: 0 },
      { name: "On", frame: 1 },
      { name: "Choosing Start", frame: 2 },
      { name: "Choosing End", frame: 3 }
    ],
    commandFrames: [0, 1, 2, 3],
    commands: [
      { id: "fixture-hide", frame: 0, type: "setVisible", target: "false" },
      { id: "fixture-stop-off", frame: 0, type: "stop" },
      { id: "fixture-show", frame: 1, type: "setVisible", target: "true" },
      { id: "fixture-stop-on", frame: 1, type: "stop" },
      { id: "fixture-choosing-start", frame: 2, type: "setVisible", target: "true" },
      { id: "fixture-stop-choosing-start", frame: 2, type: "stop" },
      { id: "fixture-choosing-end", frame: 3, type: "setVisible", target: "true" },
      { id: "fixture-stop-choosing-end", frame: 3, type: "stop" }
    ],
    tracks: []
  };
  artManifest.compositions["fixture-card"] = {
    name: "Fixture Card", surface: "stage", compositionKind: "gameObject", isCustom: true,
    canvas: { width: 100, height: 140 },
    timeline: fixtureVisibleTimeline,
    components: [
      { id: "card", name: "Card", kind: "shape", x: 50, y: 70, width: 96, height: 136, fillColor: "#fffdf4", defaultAnimationState: "On" },
      { id: "label", name: "Label", kind: "text", x: 50, y: 70, width: 86, height: 50, defaultText: "CARD", fontSize: 18, fontColor: "#17131f", defaultAnimationState: "On" }
    ]
  };
  artManifest.compositions["fixture-hand-row"] = {
    name: "Fixture Hand Row", surface: "stage", compositionKind: "gameObject", isCustom: true,
    canvas: { width: 640, height: 150 },
    timeline: fixtureVisibleTimeline,
    components: [{ id: "cards-slot", name: "Cards Slot", kind: "container", childDistribution: "horizontal", x: 320, y: 75, width: 620, height: 145, fillColor: "transparent", defaultAnimationState: "On", children: [] }]
  };
  artManifest.compositions["fixture-player-presentation"] = {
    name: "Fixture Player Presentation", surface: "stage", compositionKind: "gameObject", isCustom: true,
    canvas: { width: 300, height: 210 },
    timeline: fixtureVisibleTimeline,
    components: [
      { id: "fixture-player-name", name: "Fixture Player Name", kind: "text", x: 150, y: 18, width: 220, height: 28, defaultText: "PLAYER", fontSize: 20, fontColor: "#17131f", defaultAnimationState: "On" },
      { id: "fixture-player-score", name: "Fixture Player Score", kind: "text", x: 150, y: 48, width: 120, height: 28, defaultText: "0", fontSize: 20, fontColor: "#17131f", defaultAnimationState: "On" },
      { id: "fixture-player-rows", name: "Fixture Player Rows", kind: "container", childDistribution: "vertical", x: 150, y: 130, width: 280, height: 150, fillColor: "transparent", defaultAnimationState: "On", children: [] }
    ]
  };
  fs.writeFileSync(artManifestPath, `${JSON.stringify(artManifest, null, 2)}\n`);
  refreshLocalContentBundle(path.join(targetRoot, "content"), { trackLineage: false });
  generatedSnapshot = createLocalContentBundleProvider({ root: path.join(targetRoot, "content") }).loadPublishedRevision();
  const developmentSmokePath = path.join(targetRoot, ".pop-party-packed-browser-smoke.cjs");
  fs.writeFileSync(developmentSmokePath, `
    const fs = require("node:fs");
    const { startDevelopmentApplication } = require("@pop-party/engine/tooling");
    const { chromium } = require(${JSON.stringify(playwrightModulePath)});
    (async () => {
      const first = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: ${JSON.stringify(engineVersion)}, host: "127.0.0.1", port: 0 });
      const browser = await chromium.launch({ headless: true });
      const firstHealth = await (await fetch(first.startup.localUrl + "/health")).json();
      const flowResponse = await fetch(first.startup.localUrl + "/api/game-flow");
      const flowPayload = await flowResponse.json();
      const pluginActionMeta = flowPayload.availableActionTypes.find((item) => item.id === "generated-fixture.increment");
      const pluginInputMeta = flowPayload.availableActionTypes.find((item) => item.id === "generated-fixture.turnChoice");
      const controllerLayoutsResponse = await fetch(first.startup.localUrl + "/api/controller-layouts");
      const controllerLayoutsPayload = await controllerLayoutsResponse.json();
      const customInputLayout = {
        id: "fixture-plugin-input",
        name: "Fixture Plugin Input",
        hiddenInStates: false,
        hiddenGlobals: [],
        elements: [
          {
            id: "fixture-input-prompt",
            name: "Fixture Input Prompt",
            selector: "",
            kind: "art",
            artCompositionId: "layout-text-field",
            hidden: false,
            locked: false,
            x: 195,
            y: 180,
            width: 330,
            height: 110,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "Choose an action",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          },
          {
            id: "fixture-hit-button",
            name: "Fixture Hit Button",
            selector: "",
            kind: "art",
            artCompositionId: "controller-choice-option",
            hidden: false,
            locked: false,
            x: 195,
            y: 390,
            width: 300,
            height: 80,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          },
          {
            id: "fixture-stay-button",
            name: "Fixture Stay Button",
            selector: "",
            kind: "art",
            artCompositionId: "controller-choice-option",
            hidden: false,
            locked: false,
            x: 195,
            y: 500,
            width: 300,
            height: 80,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          },
          {
            id: "fixture-extra-button-three",
            name: "Fixture Extra Button Three",
            selector: "",
            kind: "art",
            artCompositionId: "controller-choice-option",
            hidden: false,
            locked: false,
            x: 195,
            y: 610,
            width: 300,
            height: 80,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          },
          {
            id: "fixture-extra-button-four",
            name: "Fixture Extra Button Four",
            selector: "",
            kind: "art",
            artCompositionId: "controller-choice-option",
            hidden: false,
            locked: false,
            x: 195,
            y: 720,
            width: 300,
            height: 80,
            scale: 1,
            rotation: 0,
            defaultAnimationState: "On",
            defaultText: "",
            fontSize: 32,
            autoFitText: false,
            fontFamily: "",
            fontColor: "#17131f"
          }
        ]
      };
      const wagerConfirmedLayout = {
        id: "fixture-wager-confirmed",
        name: "Fixture Wager Confirmed",
        hiddenGlobals: [],
        hiddenLayers: [],
        elements: [{
          id: "fixture-wager-confirmation",
          name: "Wager Confirmation",
          selector: "",
          kind: "art",
          artCompositionId: "layout-text-field",
          hidden: false,
          locked: false,
          x: 195,
          y: 420,
          width: 330,
          height: 120,
          scale: 1,
          rotation: 0,
          defaultAnimationState: "On",
          defaultText: "Wager confirmed",
          fontSize: 32,
          autoFitText: false,
          fontFamily: "",
          fontColor: "#17131f"
        }]
      };
      const gestureConfirmedLayout = {
        id: "fixture-gesture-confirmed",
        name: "Fixture Gesture Confirmed",
        hiddenGlobals: [],
        hiddenLayers: [],
        elements: [{
          id: "fixture-gesture-confirmation",
          name: "Gesture Confirmation",
          selector: "",
          kind: "art",
          artCompositionId: "voting-card",
          hidden: false,
          locked: false,
          x: 195,
          y: 420,
          width: 350,
          height: 300,
          scale: 1,
          rotation: 0,
          defaultAnimationState: "On",
          defaultText: "Gesture confirmed",
          fontSize: 32,
          autoFitText: false,
          fontFamily: "",
          fontColor: "#17131f"
        }]
      };
      const dynamicTargetsLayout = {
        id: "fixture-dynamic-targets",
        name: "Fixture Dynamic Targets",
        hiddenGlobals: [],
        hiddenLayers: [],
        elements: [{
          id: "fixture-target-collection",
          name: "Private Target Collection",
          selector: "",
          kind: "collection",
          artCompositionId: "",
          hidden: false,
          locked: false,
          x: 195,
          y: 430,
          width: 350,
          height: 280,
          scale: 1,
          rotation: 0,
          defaultAnimationState: "On",
          collectionDirection: "vertical",
          collectionGap: 12,
          collectionDistribution: "start",
          collectionAlignment: "stretch",
          collectionPadding: 10,
          collectionOverflow: "auto",
          zIndex: 25
        }]
      };
      const persistentContextLayer = {
        id: "fixture-persistent-context",
        name: "Fixture Persistent Context",
        zIndex: 150,
        elements: [{
          id: "fixture-persistent-pulse",
          name: "Persistent Pulse",
          selector: "",
          kind: "art",
          artCompositionId: "layout-text-field",
          hidden: false,
          locked: false,
          x: 195,
          y: 90,
          width: 300,
          height: 70,
          scale: 1,
          rotation: 0,
          defaultAnimationState: "On",
          defaultText: "Persistent context",
          fontSize: 24,
          autoFitText: false,
          fontFamily: "",
          fontColor: "#17131f"
        }]
      };
      const controllerLayouts = {
        ...controllerLayoutsPayload.layouts,
        global: {
          ...controllerLayoutsPayload.layouts.global,
          elements: [
            ...(controllerLayoutsPayload.layouts.global?.elements || []).filter((element) => element.id !== "fixture-global-context"),
            {
              id: "fixture-global-context",
              name: "Fixture Global Context",
              selector: "",
              kind: "art",
              artCompositionId: "layout-text-field",
              hidden: false,
              locked: false,
              x: 195,
              y: 170,
              width: 300,
              height: 60,
              scale: 1,
              rotation: 0,
              defaultAnimationState: "On",
              defaultText: "Global context",
              fontSize: 22,
              autoFitText: false,
              fontFamily: "",
              fontColor: "#17131f"
            }
          ]
        },
        layers: [
          ...(controllerLayoutsPayload.layouts.layers || []).filter((layer) => layer.id !== persistentContextLayer.id),
          persistentContextLayer
        ],
        states: [
          ...controllerLayoutsPayload.layouts.states.filter((state) => ![customInputLayout.id, wagerConfirmedLayout.id, gestureConfirmedLayout.id, dynamicTargetsLayout.id].includes(state.id)),
          customInputLayout,
          wagerConfirmedLayout,
          gestureConfirmedLayout,
          dynamicTargetsLayout
        ]
      };
      const controllerLayoutSaveResponse = await fetch(first.startup.localUrl + "/api/controller-layouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layouts: controllerLayouts })
      });
      const toolsPageErrors = [];
      const toolsPage = await browser.newPage();
      toolsPage.on("pageerror", (error) => toolsPageErrors.push(error.message));
      await toolsPage.goto(first.startup.localUrl + "/tools", { waitUntil: "load" });
      await toolsPage.locator('[data-tool-target="layout"]').click();
      await toolsPage.locator('[data-layout-group-select="fixture-renderer-preview"]').click();
      try {
        await toolsPage.waitForFunction(() => (
          document.querySelector('[data-tool-workspace="layout"]')
          && document.querySelector('[data-layout-react-component="state-list"]')
          && document.querySelectorAll('[data-layout-renderer-collection-preview="true"]').length === 2
          && document.querySelectorAll('[data-layout-renderer-collection-preview-item]').length >= 9
          && document.querySelector('[data-layout-renderer-nested-collection-preview="cards"]')
          && document.body.textContent.includes("PREVIEW CARD")
        ), null, { timeout: 15_000 });
      } catch (error) {
        const diagnostic = await toolsPage.evaluate(() => ({
          bodyText: document.body.innerText.slice(0, 1000),
          currentGroups: Array.from(document.querySelectorAll('[data-layout-group-select]')).map((element) => ({
            id: element.getAttribute("data-layout-group-select"),
            current: element.getAttribute("aria-current")
          })),
          rendererHosts: document.querySelectorAll('[data-layout-renderer-collection-preview="true"]').length,
          rendererItems: document.querySelectorAll('[data-layout-renderer-collection-preview-item]').length,
          nestedHosts: document.querySelectorAll('[data-layout-renderer-nested-collection-preview]').length,
          previewErrors: Array.from(document.querySelectorAll('[data-layout-element-preview-error]')).map((element) => element.textContent),
          pageErrors: window.__layoutToolPageErrors || []
        }));
        throw new Error("Layout renderer collection preview did not remain usable: " + JSON.stringify(diagnostic), { cause: error });
      }
      const layoutToolRendererPreview = await toolsPage.evaluate(() => ({
        workspaceVisible: Boolean(document.querySelector('[data-tool-workspace="layout"]')),
        sidebarVisible: Boolean(document.querySelector('[data-layout-react-component="state-list"]')),
        rendererHosts: document.querySelectorAll('[data-layout-renderer-collection-preview="true"]').length,
        rendererItems: document.querySelectorAll('[data-layout-renderer-collection-preview-item]').length,
        nestedHosts: document.querySelectorAll('[data-layout-renderer-nested-collection-preview="cards"]').length,
        previewText: document.body.textContent.includes("PREVIEW CARD"),
        previewErrors: document.querySelectorAll('[data-layout-element-preview-error]').length
      }));
      await toolsPage.locator('[data-layout-group-select="global"]').click();
      await toolsPage.waitForFunction(() => (
        document.querySelector('[data-layout-group-select="global"]')?.getAttribute("aria-current") === "true"
        && document.querySelector('[data-layout-react-component="state-list"]')
      ));
      await toolsPage.locator('[data-tool-target="controller-layout"]').click();
      await toolsPage.locator('[data-layout-group-select="fixture-dynamic-targets"]').click();
      await toolsPage.waitForFunction(() => (
        document.querySelectorAll('[data-layout-choice-collection-preview-item]').length === 3
        && document.body.textContent.includes("A realistic long private option label")
        && document.querySelector('[data-layout-react-component="state-list"]')
      ), null, { timeout: 15_000 });
      const controllerChoiceCollectionPreview = await toolsPage.evaluate(() => ({
        items: document.querySelectorAll('[data-layout-choice-collection-preview-item]').length,
        longLabel: document.body.textContent.includes("A realistic long private option label"),
        sidebarVisible: Boolean(document.querySelector('[data-layout-react-component="state-list"]'))
      }));
      await toolsPage.close();

      const boundaryPage = await browser.newPage();
      await boundaryPage.route("**/api/art-assets", async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        const fixtureCard = payload.compositions?.find((composition) => composition.id === "fixture-card");
        if (fixtureCard) fixtureCard.components = [null];
        await route.fulfill({ response, json: payload });
      });
      await boundaryPage.goto(first.startup.localUrl + "/tools", { waitUntil: "load" });
      await boundaryPage.locator('[data-tool-target="layout"]').click();
      await boundaryPage.locator('[data-layout-group-select="fixture-renderer-preview"]').click();
      await boundaryPage.waitForSelector('[data-layout-element-preview-error="fixture-preview-flat-cards"]', { timeout: 15_000 });
      const layoutToolErrorRecovery = await boundaryPage.evaluate(() => ({
        diagnosticVisible: Boolean(document.querySelector('[data-layout-element-preview-error="fixture-preview-flat-cards"]')),
        sidebarVisible: Boolean(document.querySelector('[data-layout-react-component="state-list"]')),
        globalSelectable: Boolean(document.querySelector('[data-layout-group-select="global"]')),
        alternateSelectable: Boolean(document.querySelector('[data-layout-group-select="lobby"]'))
      }));
      await boundaryPage.locator('[data-layout-group-select="lobby"]').click();
      await boundaryPage.waitForFunction(() => (
        document.querySelector('[data-layout-group-select="lobby"]')?.getAttribute("aria-current") === "true"
        && !document.querySelector('[data-layout-element-preview-error]')
      ));
      await boundaryPage.close();

      const stageLayoutsResponse = await fetch(first.startup.localUrl + "/api/stage-layouts");
      const stageLayoutsPayload = await stageLayoutsResponse.json();
      const runtimeIntroTextField = stageLayoutsPayload.layouts.states
        .find((state) => state.id === "intro")?.elements
        .find((element) => element.id === "layout-text-field-instance-1");
      if (runtimeIntroTextField) runtimeIntroTextField.autoFitText = true;
      const stageLayoutSaveResponse = await fetch(first.startup.localUrl + "/api/stage-layouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layouts: stageLayoutsPayload.layouts })
      });
      const collectionRoomResponse = await fetch(first.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "RCOL" })
      });
      const collectionRoom = await collectionRoomResponse.json();
      const collectionControllerOne = await browser.newPage();
      await collectionControllerOne.goto(first.startup.localUrl + "/controller?stage=RCOL&name=Player%20One&join=1", { waitUntil: "load" });
      await collectionControllerOne.waitForFunction(() => Boolean(window.controllerState?.player?.id), null, { timeout: 15_000 });
      const collectionPlayerOne = await collectionControllerOne.evaluate(() => ({ player: window.controllerState.player }));
      const collectionControllerTwo = await browser.newPage();
      await collectionControllerTwo.goto(first.startup.localUrl + "/controller?stage=RCOL&name=Player%20Two&join=1", { waitUntil: "load" });
      await collectionControllerTwo.waitForFunction(() => Boolean(window.controllerState?.player?.id), null, { timeout: 15_000 });
      const collectionPlayerTwo = await collectionControllerTwo.evaluate(() => ({ player: window.controllerState.player }));
      const collectionLobbyState = {
        id: "lobby",
        name: "Renderer Collection Fixture",
        entryTargetActionId: "collection-wait",
        actions: [
          { id: "collection-wait", name: "Inspect Initial Collection", type: "presentText", text: "Initial", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "collection-increment" },
          { id: "collection-increment", name: "Reconcile Collection", type: "generated-fixture.increment", amount: 1, resultVariable: "collectionCount", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "collection-done" },
          { id: "collection-done", name: "Inspect Reconciled Collection", type: "presentText", text: "Done", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" }
        ]
      };
      const collectionFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? collectionLobbyState : state)
      };
      await fetch(first.startup.localUrl + "/api/stage/RCOL/test-config", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stage-capability": collectionRoom.stageCapability },
        body: JSON.stringify({ flow: collectionFlow })
      });
      const collectionStagePage = await browser.newPage();
      await collectionStagePage.goto(first.startup.localUrl + "/stage?stage=RCOL", { waitUntil: "load" });
      try {
        await collectionStagePage.waitForFunction(() => (
          window.currentStageState?.action?.id === "collection-wait"
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"] > [data-game-plugin-renderer-collection-item="true"]').length === 3
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-hand-rows"] > [data-game-plugin-renderer-collection-item="true"]').length === 2
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-hand-rows"] [data-game-plugin-renderer-nested-collection="cards"] [data-game-plugin-renderer-collection-item="true"]').length === 3
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-players"] > [data-game-plugin-renderer-collection-item="true"]').length === 2
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-players"] [data-game-plugin-renderer-nested-collection="rows"] > [data-game-plugin-renderer-collection-item="true"]').length === 2
        ), null, { timeout: 15_000 });
      } catch (error) {
        const diagnostic = await collectionStagePage.evaluate(() => ({
          action: window.currentStageState?.action?.id,
          fault: window.currentStageState?.runtimeFault,
          playerModel: window.currentStageState?.gamePlugin?.viewModels?.["generated-fixture.playerPresentations"],
          runtimeConfig: JSON.parse(document.getElementById("pop-party-runtime-config")?.textContent || "{}").gamePlugin?.renderers?.find((item) => item.id === "generated-fixture.playerPresentations"),
          items: document.querySelectorAll('[data-stage-layout-element-id="fixture-players"] > [data-game-plugin-renderer-collection-item="true"]').length,
          playerHtml: document.querySelector('[data-stage-layout-element-id="fixture-players"]')?.innerHTML.slice(0, 4000)
        }));
        throw new Error("Game-owned player presentation fixture did not reconcile: " + JSON.stringify(diagnostic), { cause: error });
      }
      await collectionStagePage.evaluate(() => {
        for (const elementId of ["fixture-hand-rows", "fixture-flat-cards"]) {
          window.setStageLayoutGameObjectShownForAction?.({
            commandSource: "flow-action",
            targetLayoutElementId: elementId,
            targetLayoutScope: "global",
            targetLayoutSurface: "stage",
            isShown: true,
            instant: true
          });
        }
      });
      try {
        await collectionStagePage.waitForFunction(() => (
          getComputedStyle(document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"]')).display === "flex"
          && getComputedStyle(document.querySelector('[data-stage-layout-element-id="fixture-hand-rows"]')).display === "flex"
          && document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"] [data-art-component-id="card"]')?.getBoundingClientRect().width > 0
          && document.querySelector('[data-stage-layout-element-id="fixture-hand-rows"] [data-art-component-id="card"]')?.getBoundingClientRect().width > 0
        ), null, { timeout: 15_000 });
      } catch (error) {
        const diagnostic = await collectionStagePage.evaluate(() => Array.from(document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"], [data-stage-layout-element-id="fixture-hand-rows"]')).map((host) => ({
          id: host.dataset.stageLayoutElementId,
          classes: host.className,
          display: getComputedStyle(host).display,
          state: host.dataset.visualState,
          items: host.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]').length
        })));
        throw new Error("Renderer collection fixture did not become visible: " + JSON.stringify(diagnostic), { cause: error });
      }
      const collectionIdentityBefore = await collectionStagePage.evaluate(() => {
        const flat = document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"]');
        const rows = document.querySelector('[data-stage-layout-element-id="fixture-hand-rows"]');
        const flatA = flat?.querySelector('[data-game-plugin-renderer-item-key="a"]');
        const topRow = rows?.querySelector('[data-game-plugin-renderer-item-key="top"]');
        const nestedA = topRow?.querySelector('[data-game-plugin-renderer-item-key="a"]');
        const flatCard = flatA?.querySelector('[data-art-component-id="card"]');
        const nestedCard = nestedA?.querySelector('[data-art-component-id="card"]');
        const visibility = (element) => {
          const rect = element?.getBoundingClientRect();
          const style = element ? getComputedStyle(element) : null;
          return {
            display: style?.display || "",
            visibility: style?.visibility || "",
            opacity: Number(style?.opacity || 0),
            width: Number(rect?.width || 0),
            height: Number(rect?.height || 0)
          };
        };
        const fallbackHost = document.createElement("div");
        fallbackHost.className = "stage-widget-art-host has-stage-widget-art";
        fallbackHost.style.position = "fixed";
        fallbackHost.style.left = "-10000px";
        const fallback = document.createElement("div");
        const artLayer = document.createElement("div");
        artLayer.className = "stage-widget-art-layer";
        fallbackHost.append(fallback, artLayer);
        document.body.appendChild(fallbackHost);
        const fallbackHidden = getComputedStyle(fallback).display === "none";
        const artLayerVisible = getComputedStyle(artLayer).display !== "none";
        fallbackHost.remove();
        window.__fixtureFlatA = flatA;
        window.__fixtureFlatARenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(flatA);
        window.__fixtureTopRow = topRow;
        window.__fixtureNestedA = nestedA;
        window.__fixtureNestedARenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(nestedA);
        return {
          flatOrder: Array.from(flat?.children || []).map((item) => item.dataset.gamePluginRendererItemKey),
          flatCount: flat?.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]').length,
          rowCount: rows?.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]').length,
          nestedCount: rows?.querySelectorAll('[data-game-plugin-renderer-nested-collection="cards"] [data-game-plugin-renderer-collection-item="true"]').length,
          initialState: flatA?.dataset.gamePluginRendererState,
          flatGap: flat ? getComputedStyle(flat).gap : "",
          rowsDirection: rows ? getComputedStyle(rows).flexDirection : "",
          flatHostIsStructural: Boolean(flat
            && flat.classList.contains("dynamic-stage-renderer-collection")
            && !flat.classList.contains("stage-widget-art-host")
            && !flat.classList.contains("has-stage-widget-art")),
          rowsHostIsStructural: Boolean(rows
            && rows.classList.contains("dynamic-stage-renderer-collection")
            && !rows.classList.contains("stage-widget-art-host")
            && !rows.classList.contains("has-stage-widget-art")),
          flatHostDisplay: flat ? getComputedStyle(flat).display : "",
          rowsHostDisplay: rows ? getComputedStyle(rows).display : "",
          flatItemVisibility: visibility(flatA),
          nestedItemVisibility: visibility(nestedA),
          flatCardVisibility: visibility(flatCard),
          nestedCardVisibility: visibility(nestedCard),
          fallbackHidden,
          artLayerVisible
        };
      });
      const artHotReloadBefore = await collectionStagePage.evaluate(() => ({
        actionId: window.currentStageState?.action?.id,
        contentRevision: window.currentStageState?.release?.contentRevision,
        cardTop: document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-item-key="a"] [data-art-component-id="card"]')?.getBoundingClientRect().top || 0
      }));
      const artToolsPage = await browser.newPage();
      artToolsPage.on("pageerror", (error) => toolsPageErrors.push(error.message));
      await artToolsPage.goto(first.startup.localUrl + "/tools", { waitUntil: "load" });
      await artToolsPage.locator('[data-tool-target="art"]').click();
      if (await artToolsPage.locator('[data-art-migration-summary]').count()) {
        artToolsPage.once("dialog", (dialog) => dialog.accept());
        const artMigrationResponse = artToolsPage.waitForResponse((response) => (
          response.url().endsWith("/api/art-compositions") && response.request().method() === "POST"
        ));
        await artToolsPage.locator('.art-composition-editor .art-editor-toolbar .flow-editor-controls button', { hasText: "Save" }).click();
        if (!(await artMigrationResponse).ok()) throw new Error("Art Manager timeline migration did not save before the live edit");
        await artToolsPage.waitForSelector('[data-art-migration-summary]', { state: "detached" });
      }
      await artToolsPage.locator('[data-art-browser-composition="fixture-card"] > button').first().dispatchEvent("click");
      await artToolsPage.waitForSelector('[data-art-canvas="fixture-card"]', { state: "attached" });
      await artToolsPage.locator('.art-timeline-target-select[title^="Card (card)"]').click();
      await artToolsPage.waitForSelector('[data-art-react-component="component-inspector"][data-art-component-id="card"]');
      const cardCanvasComponent = artToolsPage.locator('[data-art-canvas="fixture-card"] [data-art-canvas-component="card"][data-art-component-target-path]');
      const cardCanvasTopBefore = await cardCanvasComponent.evaluate((element) => element.style.top);
      const cardYField = artToolsPage.locator('[data-art-component-field="y"]').first();
      await cardYField.focus();
      await cardYField.fill("82");
      await cardYField.press("Tab");
      try {
        await artToolsPage.waitForFunction(({ previousTop }) => (
          document.querySelector('[data-art-canvas="fixture-card"] [data-art-canvas-component="card"][data-art-component-target-path]')?.style.top !== previousTop
        ), { previousTop: cardCanvasTopBefore }, { timeout: 3_000 });
      } catch (error) {
        const editorDiagnostic = await artToolsPage.evaluate(() => ({
          inspectorId: document.querySelector('[data-art-react-component="component-inspector"]')?.getAttribute("data-art-component-id"),
          fieldValue: document.querySelector('[data-art-component-field="y"]')?.value,
          activeField: document.activeElement?.getAttribute?.("data-art-component-field") || document.activeElement?.tagName,
          status: document.querySelector('[data-art-compositions-status]')?.textContent,
          selectedTargets: Array.from(document.querySelectorAll('[data-art-timeline-target-selected="true"] .art-timeline-target-select')).map((target) => target.title),
          canvasStyle: document.querySelector('[data-art-canvas="fixture-card"] [data-art-canvas-component="card"]')?.getAttribute("style")
        }));
        throw new Error("Art Manager did not commit the component position from its inspector: " + JSON.stringify(editorDiagnostic), { cause: error });
      }
      if (await cardYField.inputValue() !== "82") throw new Error("Art Manager component Y field did not retain the authored value");
      await artToolsPage.waitForFunction(() => (
        document.querySelector("[data-art-compositions-status]")?.textContent === "Unsaved changes"
      ), null, { timeout: 15_000 });
      const artSaveResponse = artToolsPage.waitForResponse((response) => (
        response.url().endsWith("/api/art-compositions") && response.request().method() === "POST"
      ));
      await artToolsPage.evaluate(() => {
        if (!window.setupToolDashboard || !window.globalSaveButton) throw new Error("Tools dashboard Save All bridge is unavailable");
        window.setupToolDashboard();
        window.globalSaveButton.click();
      });
      const savedArtResponse = await artSaveResponse;
      const savedArtRequest = JSON.parse(savedArtResponse.request().postData() || "{}");
      const savedFixtureCard = savedArtRequest.compositions?.find((composition) => composition.id === "fixture-card");
      if (!savedArtResponse.ok() || savedFixtureCard?.components?.find((component) => component.id === "card")?.y !== 82) {
        throw new Error("Art Manager Save All did not persist the edited component position: " + JSON.stringify({
          status: savedArtResponse.status(),
          compositionIds: savedArtRequest.compositions?.map((composition) => composition.id),
          card: savedFixtureCard?.components?.find((component) => component.id === "card"),
          tracks: savedFixtureCard?.timeline?.tracks
        }));
      }
      await artToolsPage.waitForFunction(() => (
        document.querySelector("#globalSaveButton")?.textContent === "Save All"
        && document.querySelector("[data-art-compositions-status]")?.textContent === "Saved"
      ), null, { timeout: 30_000 });
      await artToolsPage.close();
      try {
        await collectionStagePage.waitForFunction(({ previousRevision, previousTop }) => (
          window.currentStageState?.action?.id === "collection-wait"
          && window.currentStageState?.release?.contentRevision !== previousRevision
          && Math.abs((document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-item-key="a"] [data-art-component-id="card"]')?.getBoundingClientRect().top || 0) - previousTop) > 1
        ), { previousRevision: artHotReloadBefore.contentRevision, previousTop: artHotReloadBefore.cardTop }, { timeout: 15_000 });
      } catch (error) {
        const durableArt = await (await fetch(first.startup.localUrl + "/api/art-assets")).json();
        const roomArt = await (await fetch(first.startup.localUrl + "/api/stage/RCOL/content/art-assets")).json();
        const stageArt = await collectionStagePage.evaluate(() => ({
          actionId: window.currentStageState?.action?.id,
          contentRevision: window.currentStageState?.release?.contentRevision,
          authoredY: window.artComposition?.("fixture-card")?.components?.find((component) => component.id === "card")?.y,
          cardTop: document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-item-key="a"] [data-art-component-id="card"]')?.getBoundingClientRect().top || 0
        }));
        const yOf = (payload) => payload.compositions?.find((composition) => composition.id === "fixture-card")?.components?.find((component) => component.id === "card")?.y;
        throw new Error("Saved Art did not hot reload into the existing Stage: " + JSON.stringify({
          before: artHotReloadBefore,
          durable: { revision: durableArt.revision, y: yOf(durableArt) },
          room: { revision: roomArt.revision, y: yOf(roomArt) },
          stage: stageArt
        }), { cause: error });
      }
      const artHotReloadExistingRoom = await collectionStagePage.evaluate((before) => ({
        actionId: window.currentStageState?.action?.id,
        contentRevisionChanged: window.currentStageState?.release?.contentRevision !== before.contentRevision,
        itemRetained: window.__fixtureFlatA === document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-item-key="a"]'),
        cardTopChanged: Math.abs((document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-item-key="a"] [data-art-component-id="card"]')?.getBoundingClientRect().top || 0) - before.cardTop) > 1
      }), artHotReloadBefore);
      const hotReloadRoomResponse = await fetch(first.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "RNEW" })
      });
      const hotReloadRoom = await hotReloadRoomResponse.json();
      await fetch(first.startup.localUrl + "/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "RNEW", playerName: "New Room Player" })
      });
      await fetch(first.startup.localUrl + "/api/stage/RNEW/test-config", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stage-capability": hotReloadRoom.stageCapability },
        body: JSON.stringify({ flow: collectionFlow })
      });
      const hotReloadNewRoomPage = await browser.newPage();
      await hotReloadNewRoomPage.goto(first.startup.localUrl + "/stage?stage=RNEW", { waitUntil: "load" });
      try {
        await hotReloadNewRoomPage.waitForFunction(() => (
          window.currentStageState?.action?.id === "collection-wait"
          && window.artComposition?.("fixture-card")?.components?.find((component) => component.id === "card")?.y === 82
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-collection-item="true"]').length === 3
        ), null, { timeout: 15_000 });
      } catch (error) {
        const newRoomDiagnostic = await hotReloadNewRoomPage.evaluate(() => ({
          actionId: window.currentStageState?.action?.id,
          fault: window.currentStageState?.runtimeFault,
          release: window.currentStageState?.release,
          flatModel: window.currentStageState?.gamePlugin?.viewModels?.["generated-fixture.stageFlatCards"],
          hostPresent: Boolean(document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"]')),
          itemCount: document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-collection-item="true"]').length
        }));
        throw new Error("New room did not render the saved Art fixture: " + JSON.stringify(newRoomDiagnostic), { cause: error });
      }
      const artHotReloadNewRoom = await hotReloadNewRoomPage.evaluate(() => ({
        actionId: window.currentStageState?.action?.id,
        contentRevision: window.currentStageState?.release?.contentRevision,
        authoredY: window.artComposition?.("fixture-card")?.components?.find((component) => component.id === "card")?.y
      }));
      await hotReloadNewRoomPage.reload({ waitUntil: "load" });
      try {
        await hotReloadNewRoomPage.waitForFunction(() => (
          window.artComposition?.("fixture-card")?.components?.find((component) => component.id === "card")?.y === 82
          && document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-collection-item="true"]').length === 3
        ), null, { timeout: 15_000 });
      } catch (error) {
        const reloadedDiagnostic = await hotReloadNewRoomPage.evaluate(() => ({
          actionId: window.currentStageState?.action?.id,
          release: window.currentStageState?.release,
          authoredY: window.artComposition?.("fixture-card")?.components?.find((component) => component.id === "card")?.y,
          itemCount: document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"] [data-game-plugin-renderer-collection-item="true"]').length
        }));
        throw new Error("Reloaded room did not retain the saved Art fixture: " + JSON.stringify(reloadedDiagnostic), { cause: error });
      }
      const artHotReloadReloaded = await hotReloadNewRoomPage.evaluate(() => ({
        actionId: window.currentStageState?.action?.id,
        authoredY: window.artComposition?.("fixture-card")?.components?.find((component) => component.id === "card")?.y
      }));
      await hotReloadNewRoomPage.close();
      const playerPresentationIdentityBefore = await collectionStagePage.evaluate(({ firstPlayerId, secondPlayerId }) => {
        const host = document.querySelector('[data-stage-layout-element-id="fixture-players"]');
        const firstTile = host?.querySelector(':scope > [data-game-plugin-renderer-item-key="' + CSS.escape(firstPlayerId) + '"]');
        const secondTile = host?.querySelector(':scope > [data-game-plugin-renderer-item-key="' + CSS.escape(secondPlayerId) + '"]');
        const firstRow = firstTile?.querySelector('[data-game-plugin-renderer-nested-collection="rows"] > [data-game-plugin-renderer-item-key="main"]');
        const firstCard = firstRow?.querySelector('[data-game-plugin-renderer-item-key="a"]');
        window.__fixturePlayerFirstTile = firstTile;
        window.__fixturePlayerFirstRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(firstTile);
        window.__fixturePlayerFirstRow = firstRow;
        window.__fixturePlayerFirstCard = firstCard;
        window.__fixturePlayerFirstCardRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(firstCard);
        return {
          tiles: host?.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]').length,
          firstName: firstTile?.querySelector('[data-art-component-id="fixture-player-name"]')?.textContent?.trim(),
          firstScore: firstTile?.querySelector('[data-art-component-id="fixture-player-score"]')?.textContent?.trim(),
          secondScore: secondTile?.querySelector('[data-art-component-id="fixture-player-score"]')?.textContent?.trim(),
          firstRows: firstTile?.querySelectorAll('[data-game-plugin-renderer-nested-collection="rows"] > [data-game-plugin-renderer-collection-item="true"]').length,
          firstCards: firstRow?.querySelectorAll('[data-game-plugin-renderer-nested-collection="cards"] > [data-game-plugin-renderer-collection-item="true"]').length,
          playerRendererPresent: Boolean(window.__fixturePlayerFirstRenderer),
          nestedRendererPresent: Boolean(window.__fixturePlayerFirstCardRenderer),
          firstState: firstTile?.dataset.gamePluginRendererState
        };
      }, { firstPlayerId: collectionPlayerOne.player.id, secondPlayerId: collectionPlayerTwo.player.id });
      await fetch(first.startup.localUrl + "/api/complete-action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stage-capability": collectionRoom.stageCapability },
        body: JSON.stringify({ stageCode: "RCOL", actionId: "collection-wait", source: "callback" })
      });
      await collectionStagePage.waitForFunction(() => (
        window.currentStageState?.action?.id === "collection-done"
        && document.querySelectorAll('[data-stage-layout-element-id="fixture-flat-cards"] > [data-game-plugin-renderer-collection-item="true"]').length === 4
      ), null, { timeout: 15_000 });
      const collectionReconcileState = await collectionStagePage.evaluate(() => {
        const flat = document.querySelector('[data-stage-layout-element-id="fixture-flat-cards"]');
        const rows = document.querySelector('[data-stage-layout-element-id="fixture-hand-rows"]');
        const flatA = flat?.querySelector('[data-game-plugin-renderer-item-key="a"]');
        const topRow = rows?.querySelector('[data-game-plugin-renderer-item-key="top"]');
        const nestedA = topRow?.querySelector('[data-game-plugin-renderer-item-key="a"]');
        const flatCard = flatA?.querySelector('[data-art-component-id="card"]');
        const nestedCard = nestedA?.querySelector('[data-art-component-id="card"]');
        const visibleRect = (element) => {
          const rect = element?.getBoundingClientRect();
          const style = element ? getComputedStyle(element) : null;
          return Boolean(rect && rect.width > 0 && rect.height > 0
            && style?.display !== "none" && style?.visibility !== "hidden" && Number(style?.opacity || 0) > 0);
        };
        return {
          flatOrder: Array.from(flat?.children || []).map((item) => item.dataset.gamePluginRendererItemKey),
          flatCount: flat?.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]').length,
          nestedCount: rows?.querySelectorAll('[data-game-plugin-renderer-nested-collection="cards"] [data-game-plugin-renderer-collection-item="true"]').length,
          flatRetained: flatA === window.__fixtureFlatA,
          flatRendererRetained: window.__fixtureFlatARenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(flatA),
          rowRetained: topRow === window.__fixtureTopRow,
          nestedRetained: nestedA === window.__fixtureNestedA,
          nestedRendererRetained: window.__fixtureNestedARenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(nestedA),
          changedState: flatA?.dataset.gamePluginRendererState,
          addedLabel: flat?.querySelector('[data-game-plugin-renderer-item-key="d"] [data-art-component-id="label"]')?.textContent?.trim(),
          flatItemVisible: visibleRect(flatA),
          nestedItemVisible: visibleRect(nestedA),
          flatCardVisible: visibleRect(flatCard),
          nestedCardVisible: visibleRect(nestedCard)
        };
      });
      const playerPresentationReconcileState = await collectionStagePage.evaluate((firstPlayerId) => {
        const host = document.querySelector('[data-stage-layout-element-id="fixture-players"]');
        const firstTile = host?.querySelector(':scope > [data-game-plugin-renderer-item-key="' + CSS.escape(firstPlayerId) + '"]');
        const firstRow = firstTile?.querySelector('[data-game-plugin-renderer-nested-collection="rows"] > [data-game-plugin-renderer-item-key="main"]');
        const cards = Array.from(firstRow?.querySelectorAll('[data-game-plugin-renderer-nested-collection="cards"] > [data-game-plugin-renderer-collection-item="true"]') || []);
        const retainedCard = firstRow?.querySelector('[data-game-plugin-renderer-item-key="a"]');
        return {
          tileRetained: firstTile === window.__fixturePlayerFirstTile,
          playerRendererRetained: window.__fixturePlayerFirstRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(firstTile),
          rowRetained: firstRow === window.__fixturePlayerFirstRow,
          cardRetained: retainedCard === window.__fixturePlayerFirstCard,
          cardRendererRetained: window.__fixturePlayerFirstCardRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(retainedCard),
          cardCount: cards.length,
          cardOrder: cards.map((card) => card.dataset.gamePluginRendererItemKey),
          score: firstTile?.querySelector('[data-art-component-id="fixture-player-score"]')?.textContent?.trim(),
          tiles: host?.querySelectorAll(':scope > [data-game-plugin-renderer-collection-item="true"]').length
        };
      }, collectionPlayerOne.player.id);
      await collectionStagePage.close();
      await collectionControllerOne.close();
      await collectionControllerTwo.close();
      const vipRoomResponse = await fetch(first.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "VIPR" })
      });
      const vipRoom = await vipRoomResponse.json();
      const sourceLobbyState = flowPayload.flow.states.find((state) => state.id === "lobby");
      const nestedAutoFitText = "HIT OR STAY — TEST THE COMPLETE NESTED PRESENT TEXT CONTRACT ACROSS A REAL AUTHORED LAYOUT FIELD WITHOUT CLIPPING ANY OF THESE WORDS";
      const vipControllerFlow = {
        ...flowPayload.flow,
        states: [
          { ...sourceLobbyState, nextStateTargetId: "intro" },
          {
            id: "intro",
            name: "VIP Next Fixture",
            entryTargetActionId: "vip-next",
            nextStateTargetId: "crafting-game-state",
            actions: [
              {
                id: "vip-next",
                name: "VIP Next",
                type: "presentText",
                category: "input",
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "vip-intro-end",
                stageClickTargetActionId: "vip-intro-end",
                text: nestedAutoFitText,
                textTarget: "layout-text-field-instance-1",
                isShown: true,
                instant: true,
                subActions: []
              },
              {
                id: "vip-intro-end",
                name: "End VIP Next Fixture",
                type: "endMoment",
                category: "standard",
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "return",
                subActions: []
              }
            ]
          },
          {
            id: "crafting-game-state",
            name: "VIP Crafting Choice Fixture",
            entryTargetActionId: "vip-crafting-next",
            nextStateTargetId: "none",
            actions: [
              {
                id: "vip-crafting-next",
                name: "VIP Crafting Next",
                type: "presentText",
                category: "input",
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "vip-random-choice",
                stageClickTargetActionId: "vip-random-choice",
                text: "Open the crafting question",
                textTarget: "crafting-game-statemomenttext",
                isShown: true,
                instant: true,
                subActions: []
              },
              {
                id: "vip-random-choice",
                name: "Prepare Crafting Choice",
                type: "getRandomMultipleChoiceContent",
                category: "standard",
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "vip-crafting-choice",
                variableName: "multipleChoicePrompt",
                subActions: []
              },
              {
                id: "vip-crafting-choice",
                name: "Crafting Multiple Choice",
                type: "triviaInput",
                category: "input",
                timing: { mode: "E+", seconds: 0 },
                nextTargetActionId: "return",
                contentVariable: "multipleChoicePrompt",
                inputMode: "submitOnce",
                locked: false,
                randomizeOptions: true,
                timerEndTargetActionId: "none",
                answersSubmittedTargetActionId: "none",
                subActions: []
              }
            ]
          }
        ]
      };
      const vipConfigResponse = await fetch(first.startup.localUrl + "/api/stage/VIPR/test-config", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stage-capability": vipRoom.stageCapability },
        body: JSON.stringify({ flow: vipControllerFlow })
      });
      if (!vipConfigResponse.ok) throw new Error("Could not install the VIP Controller projection fixture");
      const vipStagePage = await browser.newPage();
      await vipStagePage.addInitScript(({ stageCode, stageCapability }) => {
        sessionStorage.setItem("partyTemplateStageCapability:" + stageCode, stageCapability);
      }, { stageCode: "VIPR", stageCapability: vipRoom.stageCapability });
      await vipStagePage.goto(first.startup.localUrl + "/stage?stage=VIPR", { waitUntil: "load" });
      const vipControllerPage = await browser.newPage();
      const waitingControllerPage = await browser.newPage();
      await vipControllerPage.goto(first.startup.localUrl + "/controller?stage=VIPR&name=Vip&join=1", { waitUntil: "load" });
      await vipControllerPage.waitForFunction(() => (
        window.controllerState?.player?.isVip === true
        && document.querySelector('[data-option-id="lobby.startGame"]')
      ), null, { timeout: 15_000 });
      await waitingControllerPage.goto(first.startup.localUrl + "/controller?stage=VIPR&name=Waiting&join=1", { waitUntil: "load" });
      await waitingControllerPage.waitForFunction(() => (
        window.controllerState?.player?.isVip === false
        && !document.querySelector('[data-option-id="lobby.startGame"]')
      ), null, { timeout: 15_000 });

      const startResponsePromise = vipControllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/start") && response.request().method() === "POST"
      ));
      await vipControllerPage.locator('[data-option-id="lobby.startGame"]').click();
      const startControllerLobby = (await (await startResponsePromise).json()).lobby;
      try {
        await vipControllerPage.waitForFunction(() => (
          window.controllerState?.controllerViewStateId === "inGame"
          && document.querySelector('[data-option-id="global.next"]')
        ), null, { timeout: 15_000 });
      } catch (error) {
        const controllerDiagnostic = await vipControllerPage.evaluate(() => ({
          bodyText: document.body.innerText.slice(0, 500),
          buttons: Array.from(document.querySelectorAll("button")).map((button) => ({
            actionId: button.dataset.actionId,
            disabled: button.disabled,
            optionId: button.dataset.optionId,
            text: button.textContent?.trim()
          })),
          lobby: window.controllerState?.lobby,
          viewStateId: window.controllerState?.controllerViewStateId
        }));
        const stageDiagnostic = await vipStagePage.evaluate(() => ({
          lobby: window.currentStageState,
          bodyText: document.body.innerText.slice(0, 500)
        }));
        throw new Error("VIP Controller did not receive the first Next action: " + JSON.stringify({ controllerDiagnostic, stageDiagnostic }), { cause: error });
      }
      await vipStagePage.waitForFunction((expected) => Array.from(document.querySelectorAll(
        '[data-stage-layout-element-id="layout-text-field-instance-1"] .art-runtime-object-label'
      )).some((label) => label.getAttribute('aria-label') === expected), nestedAutoFitText, { timeout: 15_000 });
      const nestedAutoFitResult = await vipStagePage.evaluate((expected) => {
        const label = Array.from(document.querySelectorAll(
          '[data-stage-layout-element-id="layout-text-field-instance-1"] .art-runtime-object-label'
        )).find((candidate) => candidate.getAttribute('aria-label') === expected);
        const style = label ? getComputedStyle(label) : null;
        return {
          exactText: label?.getAttribute('aria-label'),
          domText: label?.textContent?.trim(),
          fontSize: Number.parseFloat(style?.fontSize || "0"),
          clientWidth: label?.clientWidth || 0,
          clientHeight: label?.clientHeight || 0,
          scrollWidth: label?.scrollWidth || 0,
          scrollHeight: label?.scrollHeight || 0,
          autoFitSource: label?.dataset.textFitSource
        };
      }, nestedAutoFitText);
      const vipFirstNextState = await vipControllerPage.evaluate(() => ({
        actionId: document.querySelector('[data-option-id="global.next"]')?.dataset.actionId,
        phase: window.controllerState?.lobby?.phase,
        surface: window.controllerState?.lobby?.surface,
        surfaceRevision: window.controllerState?.lobby?.surfaceRevision,
        viewStateId: window.controllerState?.controllerViewStateId
      }));
      await waitingControllerPage.waitForFunction(() => (
        window.controllerState?.controllerViewStateId === "inGame"
        && !document.querySelector('[data-option-id="global.next"]')
      ), null, { timeout: 15_000 });
      const nonVipWaitingState = await waitingControllerPage.evaluate(() => ({
        phase: window.controllerState?.lobby?.phase,
        surface: window.controllerState?.lobby?.surface,
        viewStateId: window.controllerState?.controllerViewStateId,
        nextButtons: document.querySelectorAll('[data-option-id="global.next"]').length
      }));

      const controllerAdvanceSurfaces = [];
      for (let step = 0; step < 2; step += 1) {
        const previousActionId = await vipControllerPage.locator('[data-option-id="global.next"]').getAttribute("data-action-id");
        const responsePromise = vipControllerPage.waitForResponse((response) => (
          response.url().endsWith("/api/input-event") && response.request().method() === "POST"
        ));
        await vipControllerPage.locator('[data-option-id="global.next"]').click();
        const responseLobby = (await (await responsePromise).json()).lobby;
        controllerAdvanceSurfaces.push(responseLobby?.surface);
        if (step < 1) {
          await vipControllerPage.waitForFunction((priorActionId) => {
            const next = document.querySelector('[data-option-id="global.next"]');
            return next && next.dataset.actionId && next.dataset.actionId !== priorActionId;
          }, previousActionId, { timeout: 15_000 });
        }
      }
      await vipControllerPage.waitForFunction(() => (
        window.controllerState?.controllerViewStateId === "choiceInput"
        && document.querySelectorAll('#controllerChoiceGrid [data-controller-option]').length >= 2
      ), null, { timeout: 15_000 });
      const vipCraftingChoiceState = await vipControllerPage.evaluate(() => ({
        actionId: window.controllerState?.lobby?.action?.id,
        optionCount: document.querySelectorAll('#controllerChoiceGrid [data-controller-option]').length,
        phase: window.controllerState?.lobby?.phase,
        surface: window.controllerState?.lobby?.surface,
        surfaceRevision: window.controllerState?.lobby?.surfaceRevision,
        viewStateId: window.controllerState?.controllerViewStateId
      }));
      await vipStagePage.close();
      await vipControllerPage.close();
      await waitingControllerPage.close();
      const vipControllerJourney = {
        advanceSurfaces: controllerAdvanceSurfaces,
        craftingChoice: vipCraftingChoiceState,
        firstNext: vipFirstNextState,
        nonVipWaiting: nonVipWaitingState,
        startSurface: startControllerLobby?.surface
      };
      const fixtureLobby = {
          id: "lobby",
          name: "Lobby",
          entryTargetActionId: "fixture-increment",
          actions: [
            {
              id: "fixture-increment",
              name: "Increment Fixture Counter",
              type: "generated-fixture.increment",
              amount: 2,
              resultVariable: "fixtureCount",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "fixture-decision"
            },
            {
              id: "fixture-decision",
              name: "Branch On Fixture Counter",
              type: "decision",
              variable: "flowVariables.fixtureCount",
              valueType: "int",
              subActions: [],
              branches: [
                { id: "branch-hit", type: "code", code: "x == 2", targetActionId: "fixture-hit" },
                { id: "branch-miss", type: "noMatch", targetActionId: "fixture-miss" }
              ]
            },
            {
              id: "fixture-hit",
              name: "Fixture Hit",
              type: "presentText",
              text: "Plugin branch hit",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "none"
            },
            {
              id: "fixture-miss",
              name: "Fixture Miss",
              type: "presentText",
              text: "Plugin branch missed",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "none"
            }
          ]
      };
      const fixtureFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? fixtureLobby : state)
      };
      const stageHtml = await (await fetch(first.startup.localUrl + "/stage")).text();
      const controllerHtml = await (await fetch(first.startup.localUrl + "/controller")).text();
      const roomResponse = await fetch(first.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "PLUG" })
      });
      const room = await roomResponse.json();
      const initialLobbyResponse = await fetch(first.startup.localUrl + "/api/stage/PLUG/lobby");
      await initialLobbyResponse.json();
      const stageHeaders = {
        "content-type": "application/json",
        "x-stage-capability": room.stageCapability
      };
      const testConfigResponse = await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: fixtureFlow })
      });
      const configuredLobby = (await testConfigResponse.json()).lobby;
      const completeResponse = await fetch(first.startup.localUrl + "/api/complete-action", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ stageCode: "PLUG", actionId: "fixture-increment", source: "callback" })
      });
      const completedLobby = (await completeResponse.json()).lobby;
      const joinPlayer = async (name) => {
        const response = await fetch(first.startup.localUrl + "/api/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stageCode: "PLUG", playerName: name })
        });
        return response.json();
      };
      const controllerPage = await browser.newPage();
      await controllerPage.goto(first.startup.localUrl + "/controller?stage=PLUG&name=One&join=1", { waitUntil: "load" });
      await controllerPage.waitForFunction(() => Boolean(window.controllerState?.player?.id), null, { timeout: 15_000 });
      const one = await controllerPage.evaluate(() => ({
        player: window.controllerState.player,
        playerCapability: sessionStorage.getItem("partyTemplatePlayerCapability")
      }));
      const two = await joinPlayer("Two");
      const playerHeaders = (joined) => ({
        "content-type": "application/json",
        "x-player-capability": joined.playerCapability,
        "x-player-id": joined.player.id,
        "x-stage-code": "PLUG"
      });
      const inputLobby = {
        ...fixtureLobby,
        entryTargetActionId: "fixture-before-turn",
        actions: [
          {
            id: "fixture-before-turn",
            name: "Before Turn Choice",
            type: "presentText",
            text: "Preparing controller input",
            timing: { mode: "E+", seconds: 0 },
            subActions: [],
            nextTargetActionId: "fixture-turn-choice"
          },
          {
            id: "fixture-turn-choice",
            name: "Turn Choice",
            type: "generated-fixture.turnChoice",
            answersSubmittedTargetActionId: "fixture-input-decision",
            resultVariable: "inputResult",
            timing: { mode: "E+", seconds: 0 },
            subActions: []
          },
          {
            id: "fixture-input-decision",
            name: "Branch On Input",
            type: "decision",
            variable: "flowVariables.inputResult",
            valueType: "string",
            subActions: [],
            branches: [
              { id: "input-hit", type: "code", code: "x == 'hit'", targetActionId: "fixture-input-hit" },
              { id: "input-miss", type: "noMatch", targetActionId: "fixture-input-miss" }
            ]
          },
          { id: "fixture-input-hit", name: "Input Hit", type: "presentText", text: "Input branch hit", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" },
          { id: "fixture-input-miss", name: "Input Miss", type: "presentText", text: "Input branch missed", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" },
          ...fixtureLobby.actions
        ]
      };
      const inputFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? inputLobby : state)
      };
      const inputConfigResponse = await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: inputFlow })
      });
      const configuredInputLobby = (await inputConfigResponse.json()).lobby;
      const inputTransitionResponse = await fetch(first.startup.localUrl + "/api/complete-action", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ stageCode: "PLUG", actionId: "fixture-before-turn", source: "callback" })
      });
      const inputStageLobby = (await inputTransitionResponse.json()).lobby;
      const heartbeat = async (joined) => (await (await fetch(first.startup.localUrl + "/api/heartbeat", {
        method: "POST",
        headers: playerHeaders(joined),
        body: JSON.stringify({ stageCode: "PLUG", playerId: joined.player.id })
      })).json()).lobby;
      const oneInputLobby = await heartbeat(one);
      const twoInputLobby = await heartbeat(two);
      const turnInput = oneInputLobby.gamePlugin?.input;
      try {
        await controllerPage.waitForFunction(() => {
          const input = window.controllerState?.lobby?.gamePlugin?.input;
          const layoutElement = window.controllerLayoutElementForId?.("fixture-hit-button");
          const layoutHost = layoutElement && window.controllerLayoutTargetElement?.(layoutElement);
          const control = document.querySelector('[data-game-plugin-input-binding="hit"]');
          return input?.actionId === "fixture-turn-choice"
            && Boolean(layoutHost && control && layoutHost.contains(control));
        }, null, { timeout: 15_000 });
      } catch (error) {
        const diagnostic = await controllerPage.evaluate(() => ({
          revision: window.controllerState?.lobby?.revision,
          viewStateId: window.controllerState?.controllerViewStateId,
          input: window.controllerState?.lobby?.gamePlugin?.input,
          runtimeConfig: document.getElementById("pop-party-runtime-config")?.textContent,
          activeLayoutElements: Array.from(document.querySelectorAll("[data-controller-layout-element-id]"))
            .map((node) => node.getAttribute("data-controller-layout-element-id")),
          choiceHost: document.querySelector('[data-controller-layout-element-id="fixture-hit-button"]')?.outerHTML,
          controls: document.querySelectorAll("[data-game-plugin-input-binding]").length
        }));
        throw new Error("Generated controller input did not activate: " + JSON.stringify(diagnostic), { cause: error });
      }
      const controllerInputState = await controllerPage.evaluate(() => ({
        viewStateId: window.controllerState?.controllerViewStateId,
        actionId: window.controllerState?.lobby?.gamePlugin?.input?.actionId,
        layoutHostActive: (() => {
          const layoutElement = window.controllerLayoutElementForId?.("fixture-hit-button");
          const layoutHost = layoutElement && window.controllerLayoutTargetElement?.(layoutElement);
          const control = document.querySelector('[data-game-plugin-input-binding="hit"]');
          return Boolean(layoutHost && control && layoutHost.contains(control));
        })()
      }));
      const turnSubmit = await (await fetch(first.startup.localUrl + "/api/game-plugin-input", {
        method: "POST",
        headers: playerHeaders(one),
        body: JSON.stringify({
          stageCode: "PLUG",
          playerId: one.player.id,
          gameSessionId: oneInputLobby.gameSessionId,
          actionId: turnInput.actionId,
          visitId: turnInput.visitId,
          submissionId: "turn-one",
          payload: { choice: "hit" }
        })
      })).json();
      const submitPluginInputResponse = async (joined, lobby, payload, id) => {
        const response = await fetch(first.startup.localUrl + "/api/game-plugin-input", {
          method: "POST",
          headers: playerHeaders(joined),
          body: JSON.stringify({
            stageCode: "PLUG",
            playerId: joined.player.id,
            gameSessionId: lobby.gameSessionId,
            actionId: lobby.gamePlugin.input.actionId,
            visitId: lobby.gamePlugin.input.visitId,
            submissionId: id,
            payload
          })
        });
        return { status: response.status, body: await response.json() };
      };
      const gestureLobby = {
        ...fixtureLobby,
        entryTargetActionId: "fixture-gesture-tap",
        actions: [
          {
            id: "fixture-gesture-tap",
            name: "Gesture Tap",
            type: "generated-fixture.gestureChoice",
            optionCount: 2,
            answersSubmittedTargetActionId: "fixture-gesture-hold",
            timing: { mode: "E+", seconds: 0 },
            subActions: []
          },
          {
            id: "fixture-gesture-hold",
            name: "Gesture Hold",
            type: "generated-fixture.gestureChoice",
            optionCount: 4,
            answersSubmittedTargetActionId: "fixture-gesture-done",
            timing: { mode: "E+", seconds: 0 },
            subActions: []
          },
          { id: "fixture-gesture-done", name: "Gestures Done", type: "presentText", text: "Done", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" }
        ]
      };
      const gestureFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? gestureLobby : state)
      };
      await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: gestureFlow })
      });
      const oneGestureTapLobby = await heartbeat(one);
      const twoGestureTapLobby = await heartbeat(two);
      let gestureBrowserSubmissionCount = 0;
      controllerPage.on("request", (request) => {
        if (request.url().endsWith("/api/game-plugin-input") && request.method() === "POST") gestureBrowserSubmissionCount += 1;
      });
      await controllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.actionId === "fixture-gesture-tap"
        && document.querySelectorAll("[data-game-plugin-input-option]").length === 2
        && document.querySelectorAll("[data-game-plugin-input-unavailable='true']").length === 2
      ), null, { timeout: 15_000 });
      const gestureTwoSlotState = await controllerPage.evaluate(() => ({
        controls: document.querySelectorAll("[data-game-plugin-input-option]").length,
        unavailableHosts: document.querySelectorAll("[data-game-plugin-input-unavailable='true']").length
      }));
      const tapResponsePromise = controllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/game-plugin-input") && response.request().method() === "POST"
      ));
      await controllerPage.locator('[data-game-plugin-input-binding="gestureAlpha"]').click();
      const tapBrowserResponse = await tapResponsePromise;
      const tapBrowserRequest = JSON.parse(tapBrowserResponse.request().postData() || "{}");
      await controllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.submitted === true
        && window.controllerState?.lobby?.gamePlugin?.input?.layoutStateId === "fixture-gesture-confirmed"
      ), null, { timeout: 15_000 });
      const gestureSubmittedBeforeHeartbeat = await controllerPage.evaluate(() => {
        const host = document.querySelector('[data-controller-layout-element-id="fixture-gesture-confirmation"]');
        window.__fixtureGestureConfirmationHost = host;
        window.__fixtureGestureConfirmationRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(host);
        const text = (componentId) => host?.querySelector('[data-art-component-id="' + componentId + '"]')?.textContent?.trim();
        return {
          viewer: text("author-heading"),
          prompt: text("answer-text"),
          detail: text("vote-count"),
          rendererPresent: Boolean(window.__fixtureGestureConfirmationRenderer)
        };
      });
      await controllerPage.waitForTimeout(1_100);
      const gestureSubmittedAfterHeartbeat = await controllerPage.evaluate(() => {
        const host = document.querySelector('[data-controller-layout-element-id="fixture-gesture-confirmation"]');
        const text = (componentId) => host?.querySelector('[data-art-component-id="' + componentId + '"]')?.textContent?.trim();
        return {
          hostRetained: window.__fixtureGestureConfirmationHost === host,
          rendererRetained: window.__fixtureGestureConfirmationRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(host),
          viewer: text("author-heading"),
          prompt: text("answer-text"),
          detail: text("vote-count")
        };
      });
      const secondTapSubmit = await submitPluginInputResponse(two, twoGestureTapLobby, { choice: "beta", mode: "tap" }, "gesture-tap-two");
      const oneGestureHoldLobby = await heartbeat(one);
      const twoGestureHoldLobby = await heartbeat(two);
      await controllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.actionId === "fixture-gesture-hold"
        && document.querySelectorAll("[data-game-plugin-input-option]").length === 4
        && document.querySelectorAll("[data-game-plugin-input-unavailable='true']").length === 0
      ), null, { timeout: 15_000 });
      const gestureFourSlotState = await controllerPage.evaluate(() => ({
        controls: document.querySelectorAll("[data-game-plugin-input-option]").length,
        unavailableHosts: document.querySelectorAll("[data-game-plugin-input-unavailable='true']").length
      }));
      const staleGestureResponse = await submitPluginInputResponse(one, oneGestureTapLobby, { choice: "alpha", mode: "tap" }, "gesture-stale-one");
      const invalidGestureResponse = await submitPluginInputResponse(two, twoGestureHoldLobby, { choice: "beta", mode: "forged" }, "gesture-invalid-two");
      const gestureButton = controllerPage.locator('[data-game-plugin-input-binding="gestureAlpha"]');
      await gestureButton.dispatchEvent("pointerdown", { pointerId: 91, pointerType: "touch", button: 0, isPrimary: true });
      await gestureButton.dispatchEvent("pointercancel", { pointerId: 91, pointerType: "touch", button: 0, isPrimary: true });
      await controllerPage.waitForTimeout(1_600);
      const gestureCancellationState = {
        ...(await controllerPage.evaluate(() => ({
        holding: document.querySelector('[data-game-plugin-input-binding="gestureAlpha"]')?.dataset.gamePluginInputHolding,
        selected: document.querySelector('[data-game-plugin-input-binding="gestureAlpha"]')?.getAttribute("aria-pressed")
        }))),
        submissions: gestureBrowserSubmissionCount
      };
      await gestureButton.evaluate((button) => { window.__fixtureHeldGestureButton = button; });
      const holdResponsePromise = controllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/game-plugin-input") && response.request().method() === "POST"
      ));
      await gestureButton.hover();
      await controllerPage.mouse.down();
      await controllerPage.waitForTimeout(1_100);
      const gestureHoldHeartbeatState = await controllerPage.evaluate(() => ({
        retained: window.__fixtureHeldGestureButton === document.querySelector('[data-game-plugin-input-binding="gestureAlpha"]'),
        holding: window.__fixtureHeldGestureButton?.dataset.gamePluginInputHolding,
        ariaBusy: window.__fixtureHeldGestureButton?.getAttribute("aria-busy")
      }));
      const holdBrowserResponse = await holdResponsePromise;
      await controllerPage.mouse.up();
      const holdBrowserRequest = JSON.parse(holdBrowserResponse.request().postData() || "{}");
      await controllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.submitted === true
        && window.controllerState?.lobby?.gamePlugin?.input?.layoutStateId === "fixture-gesture-confirmed"
      ), null, { timeout: 15_000 });
      const secondHoldSubmit = await submitPluginInputResponse(two, twoGestureHoldLobby, { choice: "delta", mode: "hold" }, "gesture-hold-two");
      const gestureBrowserSubmissionCountAfterHold = gestureBrowserSubmissionCount;
      const secondControllerPage = await browser.newPage();
      await secondControllerPage.addInitScript((session) => {
        sessionStorage.setItem("partyTemplatePlayerId", session.playerId);
        sessionStorage.setItem("partyTemplatePlayerName", session.playerName);
        sessionStorage.setItem("partyTemplateStageCode", "PLUG");
        sessionStorage.setItem("partyTemplatePlayerCapability", session.playerCapability);
      }, {
        playerId: two.player.id,
        playerName: two.player.name,
        playerCapability: two.playerCapability
      });
      await secondControllerPage.goto(first.startup.localUrl + "/controller?stage=PLUG&name=Two&join=1", { waitUntil: "load" });
      await secondControllerPage.waitForFunction((playerId) => window.controllerState?.player?.id === playerId, two.player.id, { timeout: 15_000 });
      const dynamicFlowForCount = (optionCount) => ({
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? {
          ...fixtureLobby,
          entryTargetActionId: "fixture-dynamic-targets",
          actions: [
            {
              id: "fixture-dynamic-targets",
              name: "Dynamic Targets " + optionCount,
              type: "generated-fixture.dynamicTargets",
              optionCount,
              answersSubmittedTargetActionId: "fixture-dynamic-done",
              timing: { mode: "E+", seconds: 0 },
              subActions: []
            },
            {
              id: "fixture-dynamic-done",
              name: "Dynamic Targets Done",
              type: "presentText",
              text: "Dynamic targets complete",
              timing: { mode: "E+", seconds: 0 },
              subActions: [],
              nextTargetActionId: "none"
            }
          ]
        } : state)
      });
      const configureDynamicCount = async (optionCount) => {
        await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
          method: "POST",
          headers: stageHeaders,
          body: JSON.stringify({ flow: dynamicFlowForCount(optionCount) })
        });
        const firstLobby = await heartbeat(one);
        const secondLobby = await heartbeat(two);
        try {
          await controllerPage.waitForFunction(({ actionId, count }) => (
            window.controllerState?.lobby?.gamePlugin?.input?.actionId === actionId
            && document.querySelectorAll('[data-game-plugin-choice-collection-item="true"]').length === count
          ), { actionId: "fixture-dynamic-targets", count: optionCount }, { timeout: 15_000 });
        } catch (error) {
          const diagnostic = await controllerPage.evaluate(() => ({
            input: window.controllerState?.lobby?.gamePlugin?.input,
            collectionHosts: Array.from(document.querySelectorAll('[data-controller-layout-element-id]'))
              .map((element) => ({
                id: element.getAttribute('data-controller-layout-element-id'),
                kind: element.getAttribute('data-controller-layout-element-kind'),
                scope: element.getAttribute('data-controller-layout-scope'),
                children: element.querySelectorAll('[data-game-plugin-choice-collection-item="true"]').length
              })),
            collectionItems: document.querySelectorAll('[data-game-plugin-choice-collection-item="true"]').length,
            bodyText: document.body.innerText.slice(0, 500)
          }));
          throw new Error("Dynamic Controller collection did not reconcile: " + JSON.stringify({ optionCount, diagnostic }), { cause: error });
        }
        await secondControllerPage.waitForFunction(({ actionId, count }) => (
          window.controllerState?.lobby?.gamePlugin?.input?.actionId === actionId
          && document.querySelectorAll('[data-game-plugin-choice-collection-item="true"]').length === count
        ), { actionId: "fixture-dynamic-targets", count: Math.min(optionCount, 2) }, { timeout: 15_000 });
        return { firstLobby, secondLobby };
      };
      const dynamicCardinalities = [];
      for (const count of [0, 1, 2, 6]) {
        const configured = await configureDynamicCount(count);
        dynamicCardinalities.push({
          requested: count,
          first: configured.firstLobby.gamePlugin?.input?.viewModel?.targets?.length,
          second: configured.secondLobby.gamePlugin?.input?.viewModel?.targets?.length,
          stagePrivateInput: (await (await fetch(first.startup.localUrl + "/api/stage/PLUG/lobby")).json()).lobby.gamePlugin?.input
        });
      }
      const dynamicSixOneLobby = await heartbeat(one);
      const dynamicSixTwoLobby = await heartbeat(two);
      let dynamicBrowserSubmissionCount = 0;
      controllerPage.on("request", (request) => {
        if (request.url().endsWith("/api/game-plugin-input") && request.method() === "POST") dynamicBrowserSubmissionCount += 1;
      });
      const dynamicIdentityBefore = await controllerPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('[data-game-plugin-choice-collection-item="true"]'));
        const retained = buttons[0];
        const removed = buttons[3];
        retained?.focus();
        window.__fixtureDynamicRetainedButton = retained;
        window.__fixtureDynamicRetainedRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(retained);
        window.__fixtureDynamicRetainedArtLayer = retained?.querySelector(":scope > .controller-widget-art-layer");
        window.__fixtureDynamicRemovedButton = removed;
        return {
          count: buttons.length,
          retainedOption: retained?.dataset.gamePluginInputOption,
          removedOption: removed?.dataset.gamePluginInputOption,
          rendererPresent: Boolean(window.__fixtureDynamicRetainedRenderer)
        };
      });
      const dynamicRetained = controllerPage.locator('[data-game-plugin-input-option="' + dynamicIdentityBefore.retainedOption + '"]');
      await dynamicRetained.dispatchEvent("pointerdown", { pointerId: 191, pointerType: "touch", button: 0, isPrimary: true });
      await controllerPage.route("**/api/heartbeat", async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        const input = payload.lobby?.gamePlugin?.input;
        if (input?.type === "generated-fixture.dynamicTargets") {
          const targets = input.viewModel.targets;
          input.viewModel.targets = [targets[1], targets[0], targets[2], targets[4], targets[5], {
            id: input.viewModel.viewer + "-target-added",
            label: "New authoritative private target"
          }];
          payload.lobby.surfaceRevision = Number(payload.lobby.surfaceRevision || 0) + 1;
          payload.lobby.revision = Number(payload.lobby.revision || 0) + 1;
        }
        await route.fulfill({ response, json: payload });
      }, { times: 1 });
      await controllerPage.waitForFunction(() => (
        document.querySelector('[data-game-plugin-input-option$="-target-added"]')
        && window.__fixtureDynamicRemovedButton?.isConnected === false
      ), null, { timeout: 15_000 });
      const dynamicReconcileState = await controllerPage.evaluate(() => {
        const retained = window.__fixtureDynamicRetainedButton;
        const removed = window.__fixtureDynamicRemovedButton;
        const container = document.querySelector('[data-controller-layout-element-id="fixture-target-collection"]');
        const buttons = Array.from(container?.querySelectorAll(':scope > [data-game-plugin-choice-collection-item="true"]') || []);
        const artLayer = retained?.querySelector(":scope > .controller-widget-art-layer");
        const buttonRect = retained?.getBoundingClientRect();
        const artRect = artLayer?.getBoundingClientRect();
        const containerRect = container?.getBoundingClientRect();
        const containerStyle = container ? getComputedStyle(container) : null;
        return {
          count: buttons.length,
          order: buttons.map((button) => button.dataset.gamePluginInputOption),
          retained: retained === buttons[1],
          rendererRetained: window.__fixtureDynamicRetainedRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(retained),
          artLayerRetained: window.__fixtureDynamicRetainedArtLayer === artLayer,
          focused: document.activeElement === retained,
          holding: retained?.dataset.gamePluginInputHolding,
          ariaBusy: retained?.getAttribute("aria-busy"),
          removedDisconnected: removed?.isConnected === false,
          removedDisabled: removed?.disabled === true,
          removedStale: removed?.dataset.gamePluginInputStale,
          longLabel: container?.querySelector('[data-game-plugin-input-option$="-target-2"] [data-art-component-id="placeholder-text"]')?.textContent?.trim(),
          overflowed: Number(container?.scrollHeight || 0) > Number(container?.clientHeight || 0),
          overflow: container ? getComputedStyle(container).overflow : "",
          gap: container ? getComputedStyle(container).gap : "",
          padding: container ? getComputedStyle(container).padding : "",
          zIndex: container ? getComputedStyle(container).zIndex : "",
          structuralHost: Boolean(container
            && container.classList.contains("dynamic-controller-choice-collection")
            && !container.classList.contains("controller-widget-art-host")
            && !container.classList.contains("has-controller-widget-art")),
          visibleHost: Boolean(containerRect && containerRect.width > 0 && containerRect.height > 0
            && containerStyle?.display !== "none" && containerStyle?.visibility !== "hidden"),
          visibleItem: Boolean(buttonRect && buttonRect.width > 0 && buttonRect.height > 0
            && getComputedStyle(retained).display !== "none" && getComputedStyle(retained).visibility !== "hidden"),
          matchingBounds: Boolean(buttonRect && artRect
            && Math.abs(buttonRect.left - artRect.left) < 1
            && Math.abs(buttonRect.top - artRect.top) < 1
            && Math.abs(buttonRect.width - artRect.width) < 1
            && Math.abs(buttonRect.height - artRect.height) < 1)
        };
      });
      await dynamicRetained.dispatchEvent("pointercancel", { pointerId: 191, pointerType: "touch", button: 0, isPrimary: true });
      await controllerPage.evaluate(() => window.__fixtureDynamicRemovedButton?.click());
      await controllerPage.waitForTimeout(100);
      const dynamicStaleSubmissionCount = dynamicBrowserSubmissionCount;
      const dynamicStagePage = await browser.newPage();
      await dynamicStagePage.goto(first.startup.localUrl + "/stage?stage=PLUG", { waitUntil: "load" });
      await dynamicStagePage.waitForFunction(() => window.currentStageState?.action?.id === "fixture-dynamic-targets", null, { timeout: 15_000 });
      const dynamicStageBefore = await dynamicStagePage.evaluate(() => ({
        applies: window.__popPartyStageMetrics?.applyCount,
        surfaceRevision: window.currentStageState?.surfaceRevision,
        needsInput: Object.fromEntries((window.currentStageState?.gamePlugin?.viewModels?.["generated-fixture.playerPresentations"]?.players || [])
          .map((player) => [player.id, player.state === "Choosing Start"]))
      }));
      const dynamicSubmitResponsePromise = controllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/game-plugin-input") && response.request().method() === "POST"
      ));
      await dynamicRetained.click();
      const dynamicSubmitResponse = await dynamicSubmitResponsePromise;
      const dynamicSubmitRequest = JSON.parse(dynamicSubmitResponse.request().postData() || "{}");
      await dynamicStagePage.waitForTimeout(150);
      const dynamicStageAfterPartial = await dynamicStagePage.evaluate(() => ({
        applies: window.__popPartyStageMetrics?.applyCount,
        surfaceRevision: window.currentStageState?.surfaceRevision,
        appliedSlices: window.__popPartyStageMetrics?.lastAppliedSlices,
        needsInput: Object.fromEntries((window.currentStageState?.gamePlugin?.viewModels?.["generated-fixture.playerPresentations"]?.players || [])
          .map((player) => [player.id, player.state === "Choosing Start"]))
      }));
      const dynamicSecondResponsePromise = secondControllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/game-plugin-input") && response.request().method() === "POST"
      ));
      await secondControllerPage.locator('[data-game-plugin-choice-collection-item="true"]:not(:disabled)').first().click();
      await dynamicSecondResponsePromise;
      await dynamicStagePage.waitForFunction(() => window.currentStageState?.action?.id === "fixture-dynamic-done", null, { timeout: 15_000 });
      const dynamicBarrierAction = (await (await fetch(first.startup.localUrl + "/api/stage/PLUG/lobby")).json()).lobby.action?.id;
      await dynamicStagePage.close();
      await secondControllerPage.close();
      const transitionBurstActions = Array.from({ length: 24 }, (_, index) => ({
        id: "fixture-transition-burst-" + index,
        name: "Transition Burst " + index,
        type: "generated-fixture.increment",
        amount: 1,
        resultVariable: "transitionBurstCount",
        timing: { mode: "E+", seconds: 0 },
        subActions: [],
        nextTargetActionId: index === 23 ? "fixture-input-hit" : "fixture-transition-burst-" + (index + 1)
      }));
      const wagerLobby = {
        ...fixtureLobby,
        entryTargetActionId: "fixture-private-wager",
        actions: [
          {
            id: "fixture-private-wager",
            name: "Private Wager",
            type: "generated-fixture.privateWager",
            answersSubmittedTargetActionId: "fixture-transition-burst-0",
            timing: { mode: "E+", seconds: 0 },
            subActions: []
          },
          ...transitionBurstActions,
          { id: "fixture-input-hit", name: "Wagers Done", type: "presentText", text: "Done", timing: { mode: "E+", seconds: 0 }, subActions: [], nextTargetActionId: "none" }
        ]
      };
      const wagerFlow = {
        ...flowPayload.flow,
        states: flowPayload.flow.states.map((state) => state.id === "lobby" ? wagerLobby : state)
      };
      await fetch(first.startup.localUrl + "/api/stage/PLUG/test-config", {
        method: "POST",
        headers: stageHeaders,
        body: JSON.stringify({ flow: wagerFlow })
      });
      const stagePage = await browser.newPage();
      await stagePage.goto(first.startup.localUrl + "/stage?stage=PLUG", { waitUntil: "load" });
      try {
        await stagePage.waitForFunction(() => (
          window.currentStageState?.action?.id === "fixture-private-wager"
          && Number(window.__popPartyStageMetrics?.applyCount || 0) > 0
          && document.querySelector('[data-stage-layout-element-id="stagetitle"]')
        ), null, { timeout: 15_000 });
      } catch (error) {
        const diagnostic = await stagePage.evaluate(() => ({
          state: window.currentStageState,
          metrics: window.__popPartyStageMetrics,
          layoutHosts: Array.from(document.querySelectorAll("[data-stage-layout-element-id]"))
            .map((node) => node.getAttribute("data-stage-layout-element-id")),
          bodyText: document.body.innerText.slice(0, 500)
        }));
        throw new Error("Generated Stage projection fixture did not activate: " + JSON.stringify(diagnostic), { cause: error });
      }
      await stagePage.evaluate(() => {
        const host = document.querySelector('[data-stage-layout-element-id="stagetitle"]');
        if (!host) return;
        window.__fixtureStageHost = host;
        window.__fixtureStageRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(host);
        window.__fixtureStageAnimation = host.animate(
          [{ transform: "translateY(0px)" }, { transform: "translateY(-2px)" }, { transform: "translateY(0px)" }],
          { duration: 400, iterations: Infinity }
        );
        window.__fixtureStageFrameGaps = [];
        window.__fixtureStageFrameStop = false;
        let previous = performance.now();
        const observe = (now) => {
          window.__fixtureStageFrameGaps.push(now - previous);
          previous = now;
          if (!window.__fixtureStageFrameStop) requestAnimationFrame(observe);
        };
        requestAnimationFrame(observe);
        window.__fixtureStageLongTasks = [];
        if (window.__popPartyStageMetrics) window.__popPartyStageMetrics.maxDurationMs = 0;
        if (typeof PerformanceObserver === "function") {
          try {
            window.__fixtureStageLongTaskObserver = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) window.__fixtureStageLongTasks.push(entry.duration);
            });
            window.__fixtureStageLongTaskObserver.observe({ entryTypes: ["longtask"] });
          } catch {}
        }
        const originalApplyLayout = window.applyStageLayoutForPhase;
        window.__fixtureStageLayoutApplyCount = 0;
        window.applyStageLayoutForPhase = (...args) => {
          window.__fixtureStageLayoutApplyCount += 1;
          return originalApplyLayout?.(...args);
        };
      });
      const oneWagerLobby = await heartbeat(one);
      const twoWagerLobby = await heartbeat(two);
      await controllerPage.waitForFunction(() => {
        const input = window.controllerState?.lobby?.gamePlugin?.input;
        return input?.type === "generated-fixture.privateWager"
          && document.querySelectorAll("[data-game-plugin-input-binding]").length === 4;
      }, null, { timeout: 15_000 });
      const wagerInitialState = await controllerPage.evaluate(() => {
        const field = document.querySelector('[data-game-plugin-input-binding="amount"]');
        const left = document.querySelector('[data-game-plugin-input-binding="left"]');
        const style = field ? getComputedStyle(field) : null;
        return {
          value: field?.value,
          fontSize: Number.parseFloat(style?.fontSize || "0"),
          caretColor: style?.caretColor,
          leftPressed: left?.getAttribute("aria-pressed"),
          leftSelected: left?.classList.contains("is-selected") === true
        };
      });
      await controllerPage.locator('[data-game-plugin-input-binding="left"]').click();
      await controllerPage.locator('[data-game-plugin-input-binding="amount"]').fill("17");
      await controllerPage.waitForTimeout(1_600);
      const wagerEditedState = await controllerPage.evaluate(() => {
        const field = document.querySelector('[data-game-plugin-input-binding="amount"]');
        const left = document.querySelector('[data-game-plugin-input-binding="left"]');
        const right = document.querySelector('[data-game-plugin-input-binding="right"]');
        return {
          value: field?.value,
          leftPressed: left?.getAttribute("aria-pressed"),
          rightPressed: right?.getAttribute("aria-pressed"),
          leftSelected: left?.classList.contains("is-selected") === true,
          hostSelected: left?.parentElement?.dataset.gamePluginInputSelected,
          focused: document.activeElement === field
        };
      });
      await controllerPage.reload({ waitUntil: "load" });
      await controllerPage.waitForFunction(() => {
        const input = window.controllerState?.lobby?.gamePlugin?.input;
        return input?.type === "generated-fixture.privateWager"
          && document.querySelector('[data-game-plugin-input-binding="amount"]')?.value === "7";
      }, null, { timeout: 15_000 });
      const wagerReloadedState = await controllerPage.evaluate(() => ({
        value: document.querySelector('[data-game-plugin-input-binding="amount"]')?.value,
        leftPressed: document.querySelector('[data-game-plugin-input-binding="left"]')?.getAttribute("aria-pressed")
      }));
      await controllerPage.evaluate(() => {
        const host = document.querySelector('[data-controller-layout-scope="layer:fixture-persistent-context"][data-controller-layout-element-id="fixture-persistent-pulse"]');
        const globalHost = document.querySelector('[data-controller-layout-scope="global"][data-controller-layout-element-id="fixture-global-context"]');
        if (!host || !globalHost) return;
        window.__fixturePersistentHost = host;
        window.__fixturePersistentArtLayer = host.querySelector(":scope > .controller-widget-art-layer");
        window.__fixturePersistentRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(host);
        window.__fixtureGlobalHost = globalHost;
        window.__fixtureGlobalRenderer = window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(globalHost);
        window.__fixturePersistentAnimation = host.animate(
          [{ opacity: 1 }, { opacity: 0.82 }, { opacity: 1 }],
          { duration: 500, iterations: Infinity }
        );
      });
      await controllerPage.waitForTimeout(120);
      const persistentIdentityBefore = await controllerPage.evaluate(() => ({
        scope: window.__fixturePersistentHost?.getAttribute("data-controller-layout-scope"),
        zIndex: window.__fixturePersistentHost ? getComputedStyle(window.__fixturePersistentHost).zIndex : "",
        persistentRendererPresent: Boolean(window.__fixturePersistentRenderer),
        globalRendererPresent: Boolean(window.__fixtureGlobalRenderer),
        animationTime: Number(window.__fixturePersistentAnimation?.currentTime || 0)
      }));
      await controllerPage.locator('[data-game-plugin-input-binding="left"]').click();
      await controllerPage.locator('[data-game-plugin-input-binding="amount"]').fill("17");
      await heartbeat(two);
      await stagePage.waitForFunction(() => (window.currentStageState?.players || []).length === 2, null, { timeout: 15_000 });
      await stagePage.waitForTimeout(100);
      const stageBeforePartialSubmission = await stagePage.evaluate(() => {
        window.__fixtureStageProjectionBefore = structuredClone(window.currentStageState);
        return {
          applyCount: window.__popPartyStageMetrics?.applyCount,
          roomRevision: window.currentStageState?.revision,
          surfaceRevision: window.currentStageState?.surfaceRevision,
          layoutApplyCount: window.__fixtureStageLayoutApplyCount,
          animationTime: Number(window.__fixtureStageAnimation?.currentTime || 0),
          rendererPresent: Boolean(window.__fixtureStageRenderer),
          needsInput: Object.fromEntries((window.currentStageState?.gamePlugin?.viewModels?.["generated-fixture.playerPresentations"]?.players || [])
            .map((player) => [player.id, player.state === "Choosing Start"]))
        };
      });
      const browserSubmitResponse = controllerPage.waitForResponse((response) => (
        response.url().endsWith("/api/game-plugin-input") && response.request().method() === "POST"
      ));
      await controllerPage.locator('[data-game-plugin-input-binding="submit"]').click();
      const browserWagerResponse = await browserSubmitResponse;
      const browserWagerRequest = JSON.parse(browserWagerResponse.request().postData() || "{}");
      const firstWagerSubmit = await browserWagerResponse.json();
      await controllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.submitted === true
        && window.controllerState?.lobby?.gamePlugin?.input?.layoutStateId === "fixture-wager-confirmed"
        && document.querySelector('[data-controller-layout-element-id="fixture-wager-confirmation"]')
        && document.querySelectorAll("[data-game-plugin-input-binding]").length === 0
      ), null, { timeout: 15_000 });
      const submittedControllerState = await controllerPage.evaluate(() => ({
        layoutStateId: window.controllerState?.lobby?.gamePlugin?.input?.layoutStateId,
        submitted: window.controllerState?.lobby?.gamePlugin?.input?.submitted,
        activeControls: document.querySelectorAll("[data-game-plugin-input-binding]").length,
        persistentHostRetained: window.__fixturePersistentHost === document.querySelector('[data-controller-layout-scope="layer:fixture-persistent-context"][data-controller-layout-element-id="fixture-persistent-pulse"]'),
        persistentArtRetained: window.__fixturePersistentArtLayer === window.__fixturePersistentHost?.querySelector(":scope > .controller-widget-art-layer"),
        persistentRendererRetained: window.__fixturePersistentRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixturePersistentHost),
        globalHostRetained: window.__fixtureGlobalHost === document.querySelector('[data-controller-layout-scope="global"][data-controller-layout-element-id="fixture-global-context"]'),
        globalRendererRetained: window.__fixtureGlobalRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixtureGlobalHost),
        animationTime: Number(window.__fixturePersistentAnimation?.currentTime || 0),
        animationState: window.__fixturePersistentAnimation?.playState
      }));
      await stagePage.waitForTimeout(150);
      const stageAfterPartialSubmission = await stagePage.evaluate(() => ({
        applyCount: window.__popPartyStageMetrics?.applyCount,
        roomRevision: window.currentStageState?.revision,
        surfaceRevision: window.currentStageState?.surfaceRevision,
        layoutApplyCount: window.__fixtureStageLayoutApplyCount,
        hostRetained: window.__fixtureStageHost === document.querySelector('[data-stage-layout-element-id="stagetitle"]'),
        rendererRetained: window.__fixtureStageRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixtureStageHost),
        animationTime: Number(window.__fixtureStageAnimation?.currentTime || 0),
        animationState: window.__fixtureStageAnimation?.playState,
        appliedSlices: window.__popPartyStageMetrics?.lastAppliedSlices,
        needsInput: Object.fromEntries((window.currentStageState?.gamePlugin?.viewModels?.["generated-fixture.playerPresentations"]?.players || [])
          .map((player) => [player.id, player.state === "Choosing Start"])),
        changedProjectionKeys: Array.from(new Set([
          ...Object.keys(window.__fixtureStageProjectionBefore || {}),
          ...Object.keys(window.currentStageState || {})
        ])).filter((key) => !["revision", "serverNow", "surfaceRevision"].includes(key)
          && JSON.stringify(window.__fixtureStageProjectionBefore?.[key]) !== JSON.stringify(window.currentStageState?.[key]))
      }));
      const duplicateWagerSubmit = await (await fetch(first.startup.localUrl + "/api/game-plugin-input", {
        method: "POST",
        headers: playerHeaders(one),
        body: JSON.stringify(browserWagerRequest)
      })).json();
      await controllerPage.evaluate(() => {
        window.__fixtureTransitionFrameGaps = [];
        window.__fixtureTransitionFrameStop = false;
        let previous = performance.now();
        const observe = (now) => {
          window.__fixtureTransitionFrameGaps.push(now - previous);
          previous = now;
          if (!window.__fixtureTransitionFrameStop) requestAnimationFrame(observe);
        };
        requestAnimationFrame(observe);
      });
      await controllerPage.waitForTimeout(50);
      const secondWagerSubmit = await submitPluginInputResponse(two, twoWagerLobby, { side: "under", amount: 22 }, "wager-two");
      await stagePage.waitForFunction(() => window.currentStageState?.action?.id === "fixture-input-hit", null, { timeout: 15_000 });
      const burstCompletionLobby = (await (await fetch(first.startup.localUrl + "/api/stage/PLUG/lobby")).json()).lobby;
      await controllerPage.waitForFunction(() => window.controllerState?.lobby?.action?.id === "fixture-input-hit", null, { timeout: 15_000 });
      const stageAfterTransitionBurst = await stagePage.evaluate(() => {
        window.__fixtureStageFrameStop = true;
        window.__fixtureStageLongTaskObserver?.disconnect?.();
        return {
          applyCount: window.__popPartyStageMetrics?.applyCount,
          surfaceRevision: window.currentStageState?.surfaceRevision,
          layoutApplyCount: window.__fixtureStageLayoutApplyCount,
          layoutSliceApplyCount: window.__popPartyStageMetrics?.sliceApplyCounts?.phase,
          hostRetained: window.__fixtureStageHost === document.querySelector('[data-stage-layout-element-id="stagetitle"]'),
          rendererRetained: window.__fixtureStageRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixtureStageHost),
          animationTime: Number(window.__fixtureStageAnimation?.currentTime || 0),
          animationState: window.__fixtureStageAnimation?.playState,
          maxFrameGap: Math.max(...(window.__fixtureStageFrameGaps || [0])),
          maxLongTask: Math.max(0, ...(window.__fixtureStageLongTasks || [])),
          maxApplyDuration: Number(window.__popPartyStageMetrics?.maxDurationMs || 0),
          measuredFrames: window.__fixtureStageFrameGaps?.length || 0
        };
      });
      const transitionedControllerIdentity = await controllerPage.evaluate(() => {
        window.__fixtureTransitionFrameStop = true;
        return {
          persistentHostRetained: window.__fixturePersistentHost === document.querySelector('[data-controller-layout-scope="layer:fixture-persistent-context"][data-controller-layout-element-id="fixture-persistent-pulse"]'),
          persistentArtRetained: window.__fixturePersistentArtLayer === window.__fixturePersistentHost?.querySelector(":scope > .controller-widget-art-layer"),
          persistentRendererRetained: window.__fixturePersistentRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixturePersistentHost),
          globalHostRetained: window.__fixtureGlobalHost === document.querySelector('[data-controller-layout-scope="global"][data-controller-layout-element-id="fixture-global-context"]'),
          globalRendererRetained: window.__fixtureGlobalRenderer === window.PartyGameLayoutGameObjects?.artRendererForLayoutHost?.(window.__fixtureGlobalHost),
          originalGlobalConnected: window.__fixtureGlobalHost?.isConnected === true,
          globalCandidates: document.querySelectorAll('[data-controller-layout-scope="global"][data-controller-layout-element-id="fixture-global-context"]').length,
          animationTime: Number(window.__fixturePersistentAnimation?.currentTime || 0),
          animationState: window.__fixturePersistentAnimation?.playState,
          maxFrameGap: Math.max(...(window.__fixtureTransitionFrameGaps || [0])),
          measuredFrames: window.__fixtureTransitionFrameGaps?.length || 0
        };
      });
      const constantsResponse = await fetch(first.startup.localUrl + "/api/game-constants");
      const constantsPayload = await constantsResponse.json();
      constantsPayload.constants.gameTitle = "Generated Fixture Edited";
      const saveResponse = await fetch(first.startup.localUrl + "/api/game-constants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ constants: constantsPayload.constants })
      });
      const persistedInputFlow = structuredClone(inputFlow);
      const persistedNestedAction = persistedInputFlow.states
        .find((state) => state.id === "intro")?.actions
        .find((action) => action.type === "presentText");
      if (persistedNestedAction) {
        persistedNestedAction.text = nestedAutoFitText;
        persistedNestedAction.textTarget = "layout-text-field-instance-1";
      }
      const flowSaveResponse = await fetch(first.startup.localUrl + "/api/game-flow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow: persistedInputFlow })
      });
      const flowSavePayload = await flowSaveResponse.json();
      const savedRevision = JSON.parse(fs.readFileSync(".pop-party/content/content-bundle.json", "utf8")).rootHash;
      await stagePage.close();
      await first.runtime.stop().catch(() => {});
      await browser.close();
      const second = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: ${JSON.stringify(engineVersion)}, host: "127.0.0.1", port: 0 });
      const secondConstants = await (await fetch(second.startup.localUrl + "/api/game-constants")).json();
      const secondFlow = await (await fetch(second.startup.localUrl + "/api/game-flow")).json();
      const secondControllerLayouts = await (await fetch(second.startup.localUrl + "/api/controller-layouts")).json();
      const secondStageLayouts = await (await fetch(second.startup.localUrl + "/api/stage-layouts")).json();
      const secondArtAssets = await (await fetch(second.startup.localUrl + "/api/art-assets")).json();
      const restartedFixtureCardY = secondArtAssets.compositions
        ?.find((composition) => composition.id === "fixture-card")?.components
        ?.find((component) => component.id === "card")?.y;
      const restartedBrowser = await chromium.launch({ headless: true });
      const restartedControllerPage = await restartedBrowser.newPage();
      const restartedRoomResponse = await fetch(second.startup.localUrl + "/api/stage/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageCode: "RSTR" })
      });
      const restartedRoom = await restartedRoomResponse.json();
      await restartedControllerPage.goto(second.startup.localUrl + "/controller?stage=RSTR&name=One&join=1", { waitUntil: "load" });
      await restartedControllerPage.waitForFunction(() => Boolean(window.controllerState?.player?.id), null, { timeout: 15_000 });
      await fetch(second.startup.localUrl + "/api/stage/RSTR/test-config", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stage-capability": restartedRoom.stageCapability },
        body: JSON.stringify({ flow: wagerFlow })
      });
      await restartedControllerPage.waitForFunction(() => (
        window.controllerState?.lobby?.gamePlugin?.input?.type === "generated-fixture.privateWager"
        && document.querySelector('[data-game-plugin-input-binding="amount"]')?.value === "7"
      ), null, { timeout: 15_000 });
      await restartedControllerPage.locator('[data-game-plugin-input-binding="left"]').click();
      const wagerRestartedState = await restartedControllerPage.evaluate(() => ({
        value: document.querySelector('[data-game-plugin-input-binding="amount"]')?.value,
        leftPressed: document.querySelector('[data-game-plugin-input-binding="left"]')?.getAttribute("aria-pressed"),
        hostSelected: document.querySelector('[data-game-plugin-input-binding="left"]')?.parentElement?.dataset.gamePluginInputSelected
      }));
      await restartedBrowser.close();
      await second.runtime.stop();

      const recoveryFirst = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: ${JSON.stringify(engineVersion)}, host: "127.0.0.1", port: 0 });
      const recoveryBrowser = await chromium.launch({ headless: true });
      const recoveryToolsPage = await recoveryBrowser.newPage();
      const recoveryPageErrors = [];
      const recoveredDraftMessages = [];
      let recoveryRequired = false;
      let staleDraftRemaining = false;
      let staleDraftRejections = 0;
      let reconnectSessionAttempts = 0;
      let recoverySecondUrl = "";
      let recoveryCheckpointAttempts = 0;
      recoveryToolsPage.on("pageerror", (error) => recoveryPageErrors.push(error.message));
      await recoveryToolsPage.route("**/api/tool-drafts", async (route) => {
        if (staleDraftRemaining) {
          staleDraftRemaining = false;
          staleDraftRejections += 1;
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              error: "The live prototype authoring session is no longer active",
              errorCode: "AUTHORING_SESSION_STALE",
              errorCategory: "authoring-session"
            })
          });
          return;
        }
        recoveredDraftMessages.push(JSON.parse(route.request().postData() || "{}"));
        recoveryRequired = false;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });
      await recoveryToolsPage.route("**/api/authoring/workspace/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const responseBase = {
          ok: true,
          active: true,
          sessionId: "packed-browser-recovery",
          baselineRevision: "published-before-restart",
          localCheckpointRevision: "published-before-restart",
          workingRevision: "published-before-restart",
          gitSynced: true,
          leaseMs: 60_000,
          recoveryRequired,
          release: { contentRevision: "published-before-restart", releaseRevision: "release-before-restart" }
        };
        if (pathname.endsWith("/session")) reconnectSessionAttempts += 1;
        if (pathname.endsWith("/checkpoint")) {
          recoveryCheckpointAttempts += 1;
          if (recoveryRequired) {
            recoveryRequired = false;
            await route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ error: "Republish browser drafts", errorCode: "AUTHORING_SESSION_RECOVERY_REQUIRED" })
            });
            return;
          }
          const constantsDraft = [...recoveredDraftMessages].reverse().find((message) => message.constants)?.constants;
          if (constantsDraft && recoverySecondUrl) {
            await fetch(recoverySecondUrl + "/api/game-constants", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ constants: constantsDraft })
            });
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...responseBase,
              workingRevision: "browser-recovered",
              checkpoint: {
                schemaVersion: 1,
                gameId: "generated-fixture",
                workingRevision: "browser-recovered",
                gitContentRevision: "published-before-restart",
                gitReleaseRevision: "release-before-restart",
                savedAt: new Date().toISOString(),
                manifest: {},
                files: {}
              }
            })
          });
          return;
        }
        if (pathname.endsWith("/save")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...responseBase,
              workingRevision: "browser-recovered",
              syncedRevision: "browser-recovered",
              result: { contentRevision: "browser-recovered", release: { contentRevision: "browser-recovered", releaseRevision: "release-recovered" } }
            })
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseBase) });
      });
      await recoveryToolsPage.goto(recoveryFirst.startup.localUrl + "/tools", { waitUntil: "load" });
      await recoveryToolsPage.waitForFunction(() => document.querySelector('#globalSaveStatus')?.textContent?.includes("Git is up to date"), null, { timeout: 15_000 });
      await recoveryToolsPage.locator('[data-tool-target="constants"]').click();
      const pendingBrowserTitle = "Generated Fixture Pending In Browser";
      const recoveredBrowserTitle = "Generated Fixture Recovered From Browser";
      const recoveryTitleInput = recoveryToolsPage.locator('[data-constants-field-input="gameTitle"]');
      await recoveryTitleInput.fill(pendingBrowserTitle);
      await recoveryTitleInput.press("Enter");
      await recoveryToolsPage.waitForFunction(() => document.querySelector('[data-constants-editor-status]')?.textContent?.includes("Unsaved"));
      await recoveryToolsPage.waitForTimeout(150);
      const recoveryPort = Number(new URL(recoveryFirst.startup.localUrl).port);
      await recoveryFirst.runtime.stop();
      const recoverySecond = await startDevelopmentApplication({ cwd: process.cwd(), engineVersion: ${JSON.stringify(engineVersion)}, host: "127.0.0.1", port: recoveryPort });
      recoverySecondUrl = recoverySecond.startup.localUrl;
      recoveryRequired = true;
      staleDraftRemaining = true;
      await (await fetch(recoverySecond.startup.localUrl + "/health")).json();
      await recoveryTitleInput.fill(recoveredBrowserTitle);
      await recoveryTitleInput.press("Enter");
      try {
        await recoveryToolsPage.waitForFunction((expected) => (
          document.querySelector('[data-constants-field-input="gameTitle"]')?.value === expected
          && document.querySelector('#globalSaveButton')?.dataset.authoringRecovery === "recovered"
          && document.querySelector('#globalSaveStatus')?.textContent?.includes("Git is up to date")
        ), recoveredBrowserTitle, { timeout: 20_000 });
      } catch (error) {
        const diagnostic = await recoveryToolsPage.evaluate(() => ({
          title: document.querySelector('[data-constants-field-input="gameTitle"]')?.value,
          recoveryState: document.querySelector('#globalSaveButton')?.dataset.authoringRecovery,
          status: document.querySelector('#globalSaveStatus')?.textContent,
          saveDisabled: document.querySelector('#globalSaveButton')?.disabled,
          readOnly: document.querySelector('#constantsScreen')?.dataset.authoringReadOnly,
          editorStatus: document.querySelector('[data-constants-editor-status]')?.textContent
        }));
        throw new Error("Recovered Tools tab did not reattach with its browser model: " + JSON.stringify({
          diagnostic,
          staleDraftRejections,
          reconnectSessionAttempts,
          recoveredDraftMessages: recoveredDraftMessages.length,
          recoveryPageErrors
        }), { cause: error });
      }
      await recoveryToolsPage.locator('#globalSyncButton').click();
      try {
        await recoveryToolsPage.waitForFunction((expected) => (
          document.querySelector('[data-constants-editor-status]')?.textContent?.includes("Saved")
          && document.querySelector('#globalSyncButton')?.textContent === "Sync Now"
          && !document.querySelector('#globalSyncButton')?.disabled
          && document.querySelector('[data-constants-field-input="gameTitle"]')?.value === expected
        ), recoveredBrowserTitle, { timeout: 20_000 });
      } catch (error) {
        const diagnostic = await recoveryToolsPage.evaluate(() => ({
          title: document.querySelector('[data-constants-field-input="gameTitle"]')?.value,
          editorStatus: document.querySelector('[data-constants-editor-status]')?.textContent,
          syncText: document.querySelector('#globalSyncButton')?.textContent,
          syncDisabled: document.querySelector('#globalSyncButton')?.disabled,
          saveStatus: document.querySelector('#globalSaveStatus')?.textContent,
          saveError: document.querySelector('#globalSaveButton')?.dataset.saveError
        }));
        throw new Error("Recovered Tools tab did not checkpoint and sync: " + JSON.stringify({
          diagnostic,
          recoveryCheckpointAttempts,
          recoveredDraftMessages: recoveredDraftMessages.length,
          recoveryPageErrors
        }), { cause: error });
      }
      const recoveredConstants = await (await fetch(recoverySecond.startup.localUrl + "/api/game-constants")).json();
      const authoringRecovery = await recoveryToolsPage.evaluate(() => ({
        browserTitle: document.querySelector('[data-constants-field-input="gameTitle"]')?.value,
        clean: document.querySelector('[data-constants-editor-status]')?.textContent?.includes("Saved"),
        recoveryState: document.querySelector('#globalSaveButton')?.dataset.authoringRecovery || "",
        status: document.querySelector('#globalSaveStatus')?.textContent || "",
        workspacePresent: Boolean(document.querySelector('[data-constants-react-shell="react"]'))
      }));
      authoringRecovery.checkpointAttempts = recoveryCheckpointAttempts;
      authoringRecovery.constantsDraftPublishes = recoveredDraftMessages.filter((message) => message.constants).length;
      authoringRecovery.staleDraftRejections = staleDraftRejections;
      authoringRecovery.reconnectSessionAttempts = reconnectSessionAttempts;

      const busyToolsPage = await recoveryBrowser.newPage();
      let busyOwnerClosed = false;
      let busySessionAttempts = 0;
      const busyResponse = {
        ok: true,
        active: true,
        sessionId: "packed-browser-busy-reconnect",
        baselineRevision: "browser-recovered",
        localCheckpointRevision: "browser-recovered",
        workingRevision: "browser-recovered",
        gitSynced: true,
        leaseMs: 6000,
        release: { contentRevision: "browser-recovered", releaseRevision: "release-recovered" }
      };
      await busyToolsPage.route("**/api/authoring/workspace/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith("/session")) {
          busySessionAttempts += 1;
          if (!busyOwnerClosed) {
            await route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({
                ok: false,
                error: "Another Tools tab has an active live prototype authoring session",
                errorCode: "AUTHORING_SESSION_BUSY",
                details: { leaseMs: 6000, retryAfterMs: 2000 }
              })
            });
            return;
          }
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(busyResponse) });
      });
      await busyToolsPage.route("**/api/tool-drafts", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });
      await busyToolsPage.goto(recoverySecond.startup.localUrl + "/tools", { waitUntil: "load" });
      await busyToolsPage.waitForFunction(() => (
        document.querySelector('#globalSaveStatus')?.textContent?.includes("Another Tools tab is editing")
        && document.querySelector('#globalSaveButton')?.disabled
      ), null, { timeout: 15_000 });
      const busyReadOnly = await busyToolsPage.evaluate(() => ({
        status: document.querySelector('#globalSaveStatus')?.textContent || "",
        saveDisabled: Boolean(document.querySelector('#globalSaveButton')?.disabled),
        screenReadOnly: document.querySelector('#flowScreen')?.dataset.authoringReadOnly === "true"
      }));
      busyOwnerClosed = true;
      try {
        await busyToolsPage.waitForFunction(() => (
          document.querySelector('#globalSaveStatus')?.textContent?.includes("Git is up to date")
          && !document.querySelector('#globalSaveButton')?.disabled
          && Boolean(document.querySelector('.flow-react-shell'))
        ), null, { timeout: 20_000 });
      } catch (error) {
        const diagnostic = await busyToolsPage.evaluate(() => ({
          status: document.querySelector('#globalSaveStatus')?.textContent,
          saveDisabled: document.querySelector('#globalSaveButton')?.disabled,
          flowMounted: Boolean(document.querySelector('.flow-react-shell')),
          flowReadOnly: document.querySelector('#flowScreen')?.dataset.authoringReadOnly,
          sessionId: sessionStorage.getItem("pop-party-authoring-session")
        }));
        throw new Error("Busy Tools tab did not attach after its competing lease closed: " + JSON.stringify({
          diagnostic,
          busySessionAttempts
        }), { cause: error });
      }
      const busyReconnect = await busyToolsPage.evaluate(() => ({
        connected: document.querySelector('#globalSaveStatus')?.textContent?.includes("Git is up to date"),
        saveEnabled: !document.querySelector('#globalSaveButton')?.disabled,
        screenWritable: document.querySelector('#flowScreen')?.dataset.authoringReadOnly === "false"
      }));
      await busyToolsPage.close();
      await recoveryBrowser.close();
      await recoverySecond.runtime.stop();
      const result = {
        firstRevision: first.development.revision,
        healthRevision: firstHealth.release.contentRevision,
        saveStatus: saveResponse.status,
        savedRevision,
        secondRevision: second.development.revision,
        secondGameTitle: secondConstants.constants.gameTitle,
        recoveredServerTitle: recoveredConstants.constants.gameTitle,
        recoveredBrowserTitle,
        authoringRecovery,
        busyAuthoringReconnect: { busyReadOnly, busyReconnect, sessionAttempts: busySessionAttempts },
        recoveryPageErrors,
        pluginActionVisible: Boolean(pluginActionMeta && pluginActionMeta.fields.some((field) => field.key === "amount")),
        pluginInputVisible: Boolean(pluginInputMeta && pluginInputMeta.fields.some((field) => field.key === "resultVariable")),
        flowSaveStatus: flowSaveResponse.status,
        flowSaveError: flowSavePayload.error,
        controllerLayoutSaveStatus: controllerLayoutSaveResponse.status,
        stageLayoutSaveStatus: stageLayoutSaveResponse.status,
        toolsPageErrors,
        layoutToolRendererPreview,
        controllerChoiceCollectionPreview,
        layoutToolErrorRecovery,
        customControllerLayoutReloaded: secondControllerLayouts.layouts.states
          .some((state) => state.id === "fixture-plugin-input"
            && state.elements.some((element) => element.id === "fixture-hit-button")),
        dynamicControllerLayoutReloaded: secondControllerLayouts.layouts.states
          .some((state) => state.id === "fixture-dynamic-targets"
            && state.elements.some((element) => element.id === "fixture-target-collection"
              && element.kind === "collection"
              && element.collectionOverflow === "auto")),
        rendererCollectionRestarted: secondStageLayouts.layouts.global.elements
          .some((element) => element.id === "fixture-hand-rows"
            && element.kind === "collection"
            && element.collectionDirection === "vertical"),
        nestedAutoFitLayoutReloaded: secondStageLayouts.layouts.states
          .find((state) => state.id === "intro")?.elements
          .some((element) => element.id === "layout-text-field-instance-1" && element.autoFitText === true),
        nestedPresentTextReloaded: secondFlow.flow.states
          .find((state) => state.id === "intro")?.actions
          .some((action) => action.type === "presentText"
            && action.textTarget === "layout-text-field-instance-1"
            && action.text === nestedAutoFitText),
        artHotReloadExistingRoom,
        artHotReloadNewRoom,
        artHotReloadReloaded,
        restartedFixtureCardY,
        collectionIdentityBefore,
        collectionReconcileState,
        playerPresentationIdentityBefore,
        playerPresentationReconcileState,
        persistentLayerReloaded: secondControllerLayouts.layouts.layers
          ?.some((layer) => layer.id === "fixture-persistent-context" && layer.zIndex === 150),
        rendererManifestVisible: stageHtml.includes("generated-fixture.stageCounter")
          && stageHtml.includes("generated-fixture.stageHandRows")
          && stageHtml.includes("generated-fixture.stageFlatCards")
          && stageHtml.includes("generated-fixture.playerPresentations")
          && controllerHtml.includes("generated-fixture.controllerCounter"),
        pluginViewModel: configuredLobby.gamePlugin?.viewModels?.["generated-fixture.stageCounter"]?.label,
        vipControllerJourney,
        nestedAutoFitResult,
        configuredAction: configuredLobby.action?.id,
        configuredFault: configuredLobby.runtimeFault,
        branchSelected: completedLobby.lastDecisionTrace?.selectedBranch,
        branchedAction: completedLobby.action?.id,
        inputTransitionAction: inputStageLobby.action?.id,
        privateInputHiddenBeforeTransition: configuredInputLobby.gamePlugin?.input == null,
        privateInputHiddenFromStage: inputStageLobby.gamePlugin?.input == null,
        inputDeliveryRevisionAdvanced: Number(oneInputLobby.revision) > Number(inputStageLobby.revision),
        currentPlayerInputVisible: turnInput?.viewModel?.viewer === one.player.id,
        currentPlayerInputLayout: turnInput?.layoutStateId,
        controllerInputViewState: controllerInputState.viewStateId,
        controllerInputAction: controllerInputState.actionId,
        controllerLayoutControlBound: controllerInputState.layoutHostActive,
        waitingPlayerInputHidden: twoInputLobby.gamePlugin?.input == null,
        inputBranchSelected: turnSubmit.lobby?.lastDecisionTrace?.selectedBranch,
        inputBranchedAction: turnSubmit.lobby?.action?.id,
        gestureTwoSlotState,
        gestureFourSlotState,
        gestureSubmittedBeforeHeartbeat,
        gestureSubmittedAfterHeartbeat,
        gesturePersonalizedTextCorrect: gestureSubmittedBeforeHeartbeat.viewer === "ONE"
          && gestureSubmittedBeforeHeartbeat.prompt === "PRIVATE PROMPT FOR ONE"
          && gestureSubmittedBeforeHeartbeat.detail === ("Detail " + one.player.id).toUpperCase()
          && gestureSubmittedAfterHeartbeat.viewer === gestureSubmittedBeforeHeartbeat.viewer
          && gestureSubmittedAfterHeartbeat.prompt === gestureSubmittedBeforeHeartbeat.prompt
          && gestureSubmittedAfterHeartbeat.detail === gestureSubmittedBeforeHeartbeat.detail,
        gestureCancellationState,
        gestureHoldHeartbeatState,
        tapBrowserPayload: tapBrowserRequest.payload,
        holdBrowserPayload: holdBrowserRequest.payload,
        gestureBrowserSubmissionCount: gestureBrowserSubmissionCountAfterHold,
        gestureSecondTapStatus: secondTapSubmit.status,
        gestureSecondTapAction: secondTapSubmit.body?.lobby?.action?.id,
        gestureStaleStatus: staleGestureResponse.status,
        gestureInvalidStatus: invalidGestureResponse.status,
        gestureSecondHoldStatus: secondHoldSubmit.status,
        gestureSecondHoldAction: secondHoldSubmit.body?.lobby?.action?.id,
        dynamicCardinalities,
        dynamicPrivateSets: {
          firstViewer: dynamicSixOneLobby.gamePlugin?.input?.viewModel?.viewer,
          secondViewer: dynamicSixTwoLobby.gamePlugin?.input?.viewModel?.viewer,
          firstIds: dynamicSixOneLobby.gamePlugin?.input?.viewModel?.targets?.map((target) => target.id),
          secondIds: dynamicSixTwoLobby.gamePlugin?.input?.viewModel?.targets?.map((target) => target.id)
        },
        dynamicIdentityBefore,
        dynamicReconcileState,
        dynamicStaleSubmissionCount,
        dynamicSubmitPayload: dynamicSubmitRequest.payload,
        dynamicStageBefore,
        dynamicStageAfterPartial,
        dynamicBarrierAction,
        privateWagerTargets: [
          oneWagerLobby.gamePlugin?.input?.viewModel?.target,
          twoWagerLobby.gamePlugin?.input?.viewModel?.target
        ],
        waitingWagerLayout: twoWagerLobby.gamePlugin?.input?.layoutStateId,
        submittedWagerLayout: firstWagerSubmit.lobby?.gamePlugin?.input?.layoutStateId,
        stageBeforePartialSubmission,
        stageAfterPartialSubmission,
        stageAfterTransitionBurst,
        persistentIdentityBefore,
        submittedControllerState,
        transitionedControllerIdentity,
        wagerInitialState,
        wagerEditedState,
        wagerReloadedState,
        wagerRestartedState,
        browserWagerPayload: browserWagerRequest.payload,
        firstWagerWaited: firstWagerSubmit.lobby?.action?.id === "fixture-private-wager",
        duplicateWagerIgnored: duplicateWagerSubmit.duplicate === true,
        wagerCompletionAction: burstCompletionLobby?.action?.id,
        secondFlowActionType: secondFlow.flow.states
          .find((state) => state.id === "lobby")?.actions
          .find((action) => action.id === "fixture-increment")?.type,
        seededFirst: first.development.seeded,
        seededSecond: second.development.seeded
      };
      process.stdout.write(JSON.stringify(result));
    })().catch((error) => { console.error(error); process.exit(1); });
  `);
  const developmentSmoke = execFileSync(process.execPath, [developmentSmokePath], {
    cwd: targetRoot,
    encoding: "utf8"
  });
  const development = JSON.parse(developmentSmoke.trim().split(/\r?\n/).at(-1));
  if (!development.seededFirst || development.seededSecond
    || development.firstRevision !== development.healthRevision
    || development.saveStatus !== 200
    || development.savedRevision === development.firstRevision
    || development.secondRevision !== development.savedRevision
    || development.secondGameTitle !== "Generated Fixture Edited"
    || development.recoveredServerTitle !== development.recoveredBrowserTitle
    || development.authoringRecovery?.browserTitle !== development.recoveredBrowserTitle
    || !development.authoringRecovery?.clean
    || development.authoringRecovery?.recoveryState !== "recovered"
    || !development.authoringRecovery?.workspacePresent
    || development.authoringRecovery?.checkpointAttempts < 1
    || development.authoringRecovery?.constantsDraftPublishes < 2
    || development.authoringRecovery?.staleDraftRejections !== 1
    || development.authoringRecovery?.reconnectSessionAttempts < 2
    || !development.busyAuthoringReconnect?.busyReadOnly?.saveDisabled
    || !development.busyAuthoringReconnect?.busyReadOnly?.screenReadOnly
    || !development.busyAuthoringReconnect?.busyReconnect?.connected
    || !development.busyAuthoringReconnect?.busyReconnect?.saveEnabled
    || !development.busyAuthoringReconnect?.busyReconnect?.screenWritable
    || development.busyAuthoringReconnect?.sessionAttempts < 3
    || development.recoveryPageErrors?.length !== 0
    || !development.pluginActionVisible
    || !development.pluginInputVisible
    || development.flowSaveStatus !== 200
    || development.controllerLayoutSaveStatus !== 200
    || development.stageLayoutSaveStatus !== 200
    || development.toolsPageErrors?.length !== 0
    || !development.layoutToolRendererPreview?.workspaceVisible
    || !development.layoutToolRendererPreview?.sidebarVisible
    || development.layoutToolRendererPreview?.rendererHosts !== 2
    || development.layoutToolRendererPreview?.rendererItems < 9
    || development.layoutToolRendererPreview?.nestedHosts < 3
    || !development.layoutToolRendererPreview?.previewText
    || development.layoutToolRendererPreview?.previewErrors !== 0
    || development.controllerChoiceCollectionPreview?.items !== 3
    || !development.controllerChoiceCollectionPreview?.longLabel
    || !development.controllerChoiceCollectionPreview?.sidebarVisible
    || !development.layoutToolErrorRecovery?.diagnosticVisible
    || !development.layoutToolErrorRecovery?.sidebarVisible
    || !development.layoutToolErrorRecovery?.globalSelectable
    || !development.layoutToolErrorRecovery?.alternateSelectable
    || !development.customControllerLayoutReloaded
    || !development.dynamicControllerLayoutReloaded
    || !development.rendererCollectionRestarted
    || !development.nestedAutoFitLayoutReloaded
    || !development.nestedPresentTextReloaded
    || development.artHotReloadExistingRoom?.actionId !== "collection-wait"
    || !development.artHotReloadExistingRoom?.contentRevisionChanged
    || !development.artHotReloadExistingRoom?.itemRetained
    || !development.artHotReloadExistingRoom?.cardTopChanged
    || development.artHotReloadNewRoom?.actionId !== "collection-wait"
    || development.artHotReloadNewRoom?.authoredY !== 82
    || development.artHotReloadReloaded?.authoredY !== 82
    || development.restartedFixtureCardY !== 82
    || development.collectionIdentityBefore?.flatCount !== 3
    || development.collectionIdentityBefore?.rowCount !== 2
    || development.collectionIdentityBefore?.nestedCount !== 3
    || development.collectionIdentityBefore?.initialState !== "Choosing Start"
    || development.collectionIdentityBefore?.flatGap !== "18px"
    || development.collectionIdentityBefore?.rowsDirection !== "column"
    || !development.collectionIdentityBefore?.flatHostIsStructural
    || !development.collectionIdentityBefore?.rowsHostIsStructural
    || development.collectionIdentityBefore?.flatHostDisplay !== "flex"
    || development.collectionIdentityBefore?.rowsHostDisplay !== "flex"
    || development.collectionIdentityBefore?.flatItemVisibility?.display === "none"
    || development.collectionIdentityBefore?.flatItemVisibility?.visibility === "hidden"
    || development.collectionIdentityBefore?.flatItemVisibility?.opacity <= 0
    || development.collectionIdentityBefore?.flatItemVisibility?.width <= 0
    || development.collectionIdentityBefore?.flatItemVisibility?.height <= 0
    || development.collectionIdentityBefore?.nestedItemVisibility?.display === "none"
    || development.collectionIdentityBefore?.nestedItemVisibility?.visibility === "hidden"
    || development.collectionIdentityBefore?.nestedItemVisibility?.opacity <= 0
    || development.collectionIdentityBefore?.nestedItemVisibility?.width <= 0
    || development.collectionIdentityBefore?.nestedItemVisibility?.height <= 0
    || development.collectionIdentityBefore?.flatCardVisibility?.display === "none"
    || development.collectionIdentityBefore?.flatCardVisibility?.visibility === "hidden"
    || development.collectionIdentityBefore?.flatCardVisibility?.opacity <= 0
    || development.collectionIdentityBefore?.flatCardVisibility?.width <= 0
    || development.collectionIdentityBefore?.flatCardVisibility?.height <= 0
    || development.collectionIdentityBefore?.nestedCardVisibility?.display === "none"
    || development.collectionIdentityBefore?.nestedCardVisibility?.visibility === "hidden"
    || development.collectionIdentityBefore?.nestedCardVisibility?.opacity <= 0
    || development.collectionIdentityBefore?.nestedCardVisibility?.width <= 0
    || development.collectionIdentityBefore?.nestedCardVisibility?.height <= 0
    || !development.collectionIdentityBefore?.fallbackHidden
    || !development.collectionIdentityBefore?.artLayerVisible
    || development.collectionReconcileState?.flatCount !== 4
    || development.collectionReconcileState?.nestedCount !== 4
    || JSON.stringify(development.collectionReconcileState?.flatOrder) !== JSON.stringify(["d", "c", "b", "a"])
    || !development.collectionReconcileState?.flatRetained
    || !development.collectionReconcileState?.flatRendererRetained
    || !development.collectionReconcileState?.rowRetained
    || !development.collectionReconcileState?.nestedRetained
    || !development.collectionReconcileState?.nestedRendererRetained
    || development.collectionReconcileState?.changedState !== "Choosing End"
    || development.collectionReconcileState?.addedLabel !== "DELTA"
    || !development.collectionReconcileState?.flatItemVisible
    || !development.collectionReconcileState?.nestedItemVisible
    || !development.collectionReconcileState?.flatCardVisible
    || !development.collectionReconcileState?.nestedCardVisible
    || development.playerPresentationIdentityBefore?.tiles !== 2
    || development.playerPresentationIdentityBefore?.firstName !== "PLAYER ONE"
    || development.playerPresentationIdentityBefore?.firstScore !== "10"
    || development.playerPresentationIdentityBefore?.secondScore !== "20"
    || development.playerPresentationIdentityBefore?.firstRows !== 1
    || development.playerPresentationIdentityBefore?.firstCards !== 2
    || !development.playerPresentationIdentityBefore?.playerRendererPresent
    || !development.playerPresentationIdentityBefore?.nestedRendererPresent
    || !development.playerPresentationReconcileState?.tileRetained
    || !development.playerPresentationReconcileState?.playerRendererRetained
    || !development.playerPresentationReconcileState?.rowRetained
    || !development.playerPresentationReconcileState?.cardRetained
    || !development.playerPresentationReconcileState?.cardRendererRetained
    || development.playerPresentationReconcileState?.cardCount !== 3
    || JSON.stringify(development.playerPresentationReconcileState?.cardOrder) !== JSON.stringify(["a", "d", "b"])
    || development.playerPresentationReconcileState?.score !== "11"
    || development.playerPresentationReconcileState?.tiles !== 2
    || !development.persistentLayerReloaded
    || !development.rendererManifestVisible
    || development.pluginViewModel !== "2"
    || development.vipControllerJourney?.startSurface !== "controller"
    || development.vipControllerJourney?.firstNext?.surface !== "controller"
    || development.vipControllerJourney?.firstNext?.viewStateId !== "inGame"
    || !development.vipControllerJourney?.firstNext?.actionId
    || development.vipControllerJourney?.nonVipWaiting?.surface !== "controller"
    || development.vipControllerJourney?.nonVipWaiting?.viewStateId !== "inGame"
    || development.vipControllerJourney?.nonVipWaiting?.nextButtons !== 0
    || JSON.stringify(development.vipControllerJourney?.advanceSurfaces) !== JSON.stringify(["controller", "controller"])
    || development.vipControllerJourney?.craftingChoice?.surface !== "controller"
    || development.vipControllerJourney?.craftingChoice?.viewStateId !== "choiceInput"
    || development.vipControllerJourney?.craftingChoice?.phase !== "crafting-game-state"
    || development.vipControllerJourney?.craftingChoice?.optionCount < 2
    || development.nestedAutoFitResult?.exactText !== development.nestedAutoFitResult?.autoFitSource
    || development.nestedAutoFitResult?.exactText !== development.nestedAutoFitResult?.domText
    || development.nestedAutoFitResult?.fontSize <= 0
    || development.nestedAutoFitResult?.fontSize >= 58
    || development.nestedAutoFitResult?.clientWidth <= 0
    || development.nestedAutoFitResult?.clientHeight <= 0
    || development.nestedAutoFitResult?.scrollWidth > development.nestedAutoFitResult?.clientWidth + 1
    || development.nestedAutoFitResult?.scrollHeight > development.nestedAutoFitResult?.clientHeight + 1
    || development.branchSelected !== "branch-hit"
    || development.branchedAction !== "fixture-hit"
    || development.inputTransitionAction !== "fixture-turn-choice"
    || !development.privateInputHiddenBeforeTransition
    || !development.privateInputHiddenFromStage
    || !development.inputDeliveryRevisionAdvanced
    || !development.currentPlayerInputVisible
    || development.currentPlayerInputLayout !== "fixture-plugin-input"
    || development.controllerInputViewState !== "gamePluginInput"
    || development.controllerInputAction !== "fixture-turn-choice"
    || !development.controllerLayoutControlBound
    || !development.waitingPlayerInputHidden
    || development.inputBranchSelected !== "input-hit"
    || development.inputBranchedAction !== "fixture-input-hit"
    || development.gestureTwoSlotState?.controls !== 2
    || development.gestureTwoSlotState?.unavailableHosts !== 2
    || development.gestureFourSlotState?.controls !== 4
    || development.gestureFourSlotState?.unavailableHosts !== 0
    || !development.gestureSubmittedBeforeHeartbeat?.rendererPresent
    || !development.gestureSubmittedAfterHeartbeat?.hostRetained
    || !development.gestureSubmittedAfterHeartbeat?.rendererRetained
    || !development.gesturePersonalizedTextCorrect
    || JSON.stringify(development.tapBrowserPayload) !== JSON.stringify({ choice: "alpha", mode: "tap" })
    || JSON.stringify(development.holdBrowserPayload) !== JSON.stringify({ choice: "alpha", mode: "hold" })
    || development.gestureCancellationState?.submissions !== 1
    || development.gestureCancellationState?.holding !== "false"
    || development.gestureCancellationState?.selected !== "false"
    || !development.gestureHoldHeartbeatState?.retained
    || development.gestureHoldHeartbeatState?.holding !== "true"
    || development.gestureHoldHeartbeatState?.ariaBusy !== "true"
    || development.gestureBrowserSubmissionCount !== 2
    || development.gestureSecondTapStatus !== 200
    || development.gestureSecondTapAction !== "fixture-gesture-hold"
    || development.gestureStaleStatus !== 409
    || development.gestureInvalidStatus !== 422
    || development.gestureSecondHoldStatus !== 200
    || development.gestureSecondHoldAction !== "fixture-gesture-done"
    || JSON.stringify(development.dynamicCardinalities.map((item) => [item.requested, item.first, item.second])) !== JSON.stringify([[0, 0, 0], [1, 1, 1], [2, 2, 2], [6, 6, 2]])
    || development.dynamicCardinalities.some((item) => item.stagePrivateInput != null)
    || development.dynamicPrivateSets?.firstViewer === development.dynamicPrivateSets?.secondViewer
    || development.dynamicPrivateSets?.firstIds?.some((id) => development.dynamicPrivateSets?.secondIds?.includes(id))
    || development.dynamicIdentityBefore?.count !== 6
    || !development.dynamicIdentityBefore?.rendererPresent
    || development.dynamicReconcileState?.count !== 6
    || !development.dynamicReconcileState?.retained
    || !development.dynamicReconcileState?.rendererRetained
    || !development.dynamicReconcileState?.artLayerRetained
    || !development.dynamicReconcileState?.focused
    || development.dynamicReconcileState?.holding !== "true"
    || development.dynamicReconcileState?.ariaBusy !== "true"
    || !development.dynamicReconcileState?.removedDisconnected
    || !development.dynamicReconcileState?.removedDisabled
    || development.dynamicReconcileState?.removedStale !== "true"
    || !development.dynamicReconcileState?.order?.at(-1)?.endsWith("-target-added")
    || !development.dynamicReconcileState?.longLabel?.toLowerCase().includes("very long private target label")
    || !development.dynamicReconcileState?.overflowed
    || development.dynamicReconcileState?.overflow !== "auto"
    || development.dynamicReconcileState?.gap !== "12px"
    || development.dynamicReconcileState?.padding !== "10px"
    || development.dynamicReconcileState?.zIndex !== "325"
    || !development.dynamicReconcileState?.structuralHost
    || !development.dynamicReconcileState?.visibleHost
    || !development.dynamicReconcileState?.visibleItem
    || !development.dynamicReconcileState?.matchingBounds
    || development.dynamicStaleSubmissionCount !== 0
    || JSON.stringify(development.dynamicSubmitPayload) !== JSON.stringify({ targetPlayerId: development.dynamicIdentityBefore?.retainedOption })
    || !(development.dynamicStageAfterPartial?.applies > development.dynamicStageBefore?.applies)
    || !(development.dynamicStageAfterPartial?.surfaceRevision > development.dynamicStageBefore?.surfaceRevision)
    || JSON.stringify(development.dynamicStageAfterPartial?.appliedSlices) !== JSON.stringify(["gamePlugin"])
    || Object.values(development.dynamicStageBefore?.needsInput || {}).filter(Boolean).length !== 2
    || Object.values(development.dynamicStageAfterPartial?.needsInput || {}).filter(Boolean).length !== 1
    || development.dynamicBarrierAction !== "fixture-dynamic-done"
    || JSON.stringify(development.privateWagerTargets) !== JSON.stringify([10, 20])
    || development.wagerInitialState?.value !== "7"
    || !(development.wagerInitialState?.fontSize > 0)
    || !development.wagerInitialState?.caretColor
    || development.wagerInitialState?.leftPressed !== "false"
    || development.wagerInitialState?.leftSelected
    || development.wagerEditedState?.value !== "17"
    || development.wagerEditedState?.leftPressed !== "true"
    || development.wagerEditedState?.rightPressed !== "false"
    || !development.wagerEditedState?.leftSelected
    || development.wagerEditedState?.hostSelected !== "true"
    || !development.wagerEditedState?.focused
    || development.wagerReloadedState?.value !== "7"
    || development.wagerReloadedState?.leftPressed !== "false"
    || development.wagerRestartedState?.value !== "7"
    || development.wagerRestartedState?.leftPressed !== "true"
    || development.wagerRestartedState?.hostSelected !== "true"
    || JSON.stringify(development.browserWagerPayload) !== JSON.stringify({ side: "over", amount: 17 })
    || development.waitingWagerLayout !== "controller-text-input"
    || development.submittedWagerLayout !== "fixture-wager-confirmed"
    || development.persistentIdentityBefore?.scope !== "layer:fixture-persistent-context"
    || development.persistentIdentityBefore?.zIndex !== "150"
    || !development.persistentIdentityBefore?.persistentRendererPresent
    || !development.persistentIdentityBefore?.globalRendererPresent
    || development.submittedControllerState?.layoutStateId !== "fixture-wager-confirmed"
    || development.submittedControllerState?.submitted !== true
    || development.submittedControllerState?.activeControls !== 0
    || !development.submittedControllerState?.persistentHostRetained
    || !development.submittedControllerState?.persistentArtRetained
    || !development.submittedControllerState?.persistentRendererRetained
    || !development.submittedControllerState?.globalHostRetained
    || !development.submittedControllerState?.globalRendererRetained
    || development.submittedControllerState?.animationState !== "running"
    || !(development.submittedControllerState?.animationTime > development.persistentIdentityBefore?.animationTime)
    || !development.stageBeforePartialSubmission?.rendererPresent
    || !(development.stageAfterPartialSubmission?.applyCount > development.stageBeforePartialSubmission?.applyCount)
    || !(development.stageAfterPartialSubmission?.roomRevision > development.stageBeforePartialSubmission?.roomRevision)
    || !(development.stageAfterPartialSubmission?.surfaceRevision > development.stageBeforePartialSubmission?.surfaceRevision)
    || development.stageAfterPartialSubmission?.layoutApplyCount !== development.stageBeforePartialSubmission?.layoutApplyCount
    || JSON.stringify(development.stageAfterPartialSubmission?.appliedSlices) !== JSON.stringify(["gamePlugin"])
    || Object.values(development.stageBeforePartialSubmission?.needsInput || {}).filter(Boolean).length !== 2
    || Object.values(development.stageAfterPartialSubmission?.needsInput || {}).filter(Boolean).length !== 1
    || !development.stageAfterPartialSubmission?.hostRetained
    || !development.stageAfterPartialSubmission?.rendererRetained
    || development.stageAfterPartialSubmission?.animationState !== "running"
    || !(development.stageAfterPartialSubmission?.animationTime > development.stageBeforePartialSubmission?.animationTime)
    || !(development.stageAfterTransitionBurst?.applyCount > development.stageAfterPartialSubmission?.applyCount)
    || !(development.stageAfterTransitionBurst?.surfaceRevision > development.stageAfterPartialSubmission?.surfaceRevision)
    || development.stageAfterTransitionBurst?.layoutApplyCount !== development.stageBeforePartialSubmission?.layoutApplyCount
    || development.stageAfterTransitionBurst?.layoutSliceApplyCount !== 1
    || !development.stageAfterTransitionBurst?.hostRetained
    || !development.stageAfterTransitionBurst?.rendererRetained
    || development.stageAfterTransitionBurst?.animationState !== "running"
    || !(development.stageAfterTransitionBurst?.animationTime > development.stageAfterPartialSubmission?.animationTime)
    || development.stageAfterTransitionBurst?.measuredFrames < 5
    || development.stageAfterTransitionBurst?.maxFrameGap >= 250
    || development.stageAfterTransitionBurst?.maxLongTask >= 250
    // performance.now() includes CI runner preemption inside the synchronous apply.
    // Keep its ceiling aligned with the browser-native frame-gap and Long Task
    // limits so the gate still rejects user-visible quarter-second stalls without
    // failing solely because the shared runner descheduled Chromium mid-apply.
    || development.stageAfterTransitionBurst?.maxApplyDuration >= 250
    || !development.transitionedControllerIdentity?.persistentHostRetained
    || !development.transitionedControllerIdentity?.persistentArtRetained
    || !development.transitionedControllerIdentity?.persistentRendererRetained
    || !development.transitionedControllerIdentity?.globalHostRetained
    || !development.transitionedControllerIdentity?.globalRendererRetained
    || development.transitionedControllerIdentity?.animationState !== "running"
    || !(development.transitionedControllerIdentity?.animationTime >= development.submittedControllerState?.animationTime)
    || development.transitionedControllerIdentity?.measuredFrames < 2
    || development.transitionedControllerIdentity?.maxFrameGap >= 250
    || !development.firstWagerWaited
    || !development.duplicateWagerIgnored
    || development.wagerCompletionAction !== "fixture-input-hit"
    || development.secondFlowActionType !== "generated-fixture.increment") {
    throw new Error(`Generated game tools did not persist an independently valid local content revision: ${JSON.stringify(development)}`);
  }
  if (!fs.existsSync(path.join(targetRoot, ".pop-party", "content", "content-bundle.json"))) {
    throw new Error("Generated game development workspace was not created inside the game");
  }
  console.log(`Renderer collection browser evidence: flat ${development.collectionIdentityBefore.flatCardVisibility.width.toFixed(1)}x${development.collectionIdentityBefore.flatCardVisibility.height.toFixed(1)}, nested ${development.collectionIdentityBefore.nestedCardVisibility.width.toFixed(1)}x${development.collectionIdentityBefore.nestedCardVisibility.height.toFixed(1)}, fallback hidden ${development.collectionIdentityBefore.fallbackHidden}.`);
  console.log(`Stage projection browser evidence: private applies ${development.stageBeforePartialSubmission.applyCount}->${development.stageAfterPartialSubmission.applyCount}, public burst max frame gap ${development.stageAfterTransitionBurst.maxFrameGap.toFixed(1)}ms, max apply ${development.stageAfterTransitionBurst.maxApplyDuration.toFixed(1)}ms, layout reflows ${development.stageAfterTransitionBurst.layoutApplyCount}.`);
  console.log(`Controller projection browser evidence: start ${development.vipControllerJourney.startSurface}, Next ${development.vipControllerJourney.advanceSurfaces.join("/")}, crafting choices ${development.vipControllerJourney.craftingChoice.optionCount}.`);
  const migrationPreview = execFileSync("npm", ["run", "migrate"], { cwd: targetRoot, encoding: "utf8" });
  if (!migrationPreview.includes("Migration preview valid: level 0 -> 0") || !migrationPreview.includes("Changed paths: (none)")) {
    throw new Error("Generated game migration preview contract failed");
  }
  execFileSync("npm", ["run", "build"], { cwd: targetRoot, stdio: "pipe" });
  const gameBuild = JSON.parse(fs.readFileSync(path.join(targetRoot, "dist", "pop-party-build.json"), "utf8"));
  if (gameBuild.gameId !== "generated-fixture" || gameBuild.engineVersion !== engineVersion) {
    throw new Error("Generated game build manifest does not identify the exact game and engine");
  }
  if (gameBuild.contentRevision !== generatedSnapshot.revision) {
    throw new Error("Generated game build manifest is not pinned to the validated content revision");
  }
  console.log(`Packed create-game fixture passed: ${packed.filename} (${packed.files.length} files).`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
