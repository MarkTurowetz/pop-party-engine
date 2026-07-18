"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`could not inspect ${start}`);
  return source.slice(startIndex, endIndex);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertAbsent(source, patterns, context) {
  for (const pattern of patterns) {
    assert(!source.includes(pattern), `${context} must not call ${pattern}`);
  }
}

function checkStageReconciliation() {
  const source = read("client/runtime/stageRuntime.ts");
  const reconcile = section(source, "function applyStageState(", "function renderStageLobby(");
  assertAbsent(reconcile, [
    "revealPlayerAnswerCorrectnessForAction(",
    "runStageWipe(",
    "runVotingCardActionForAction(",
    "setCraftingTimerShownForAction(",
    "setPlayerAnswerBubblesShownForAction(",
    "setPlayersShownForAction(",
    "setStageTextObjectForAction(",
    "setStageWipeShownForAction("
  ], "applyStageState reconciliation");
}

function checkPlayerExceptions() {
  const source = read("client/runtime/stagePlayerRoster.ts");
  const syncPlayer = section(source, "  syncPlayerObject(", "  syncAvatarComponent(");
  assertAbsent(syncPlayer, [
    "syncAnswerBubbleComponent(",
    "revealAnswerCorrectness(",
    "setAnswerBubblesShown(",
    "setShown("
  ], "syncPlayerObject reconciliation");

  const choosing = section(source, "  syncAvatarBehaviorComponent(", "  syncAnswerBubbleComponent(");
  const spawning = section(source, "  playSpawnedPlayerWidget(", "  syncTileGameObject(");
  assert(!choosing.includes("complete"), "ChoosingStart/ChoosingEnd must remain fire-and-forget");
  assert(!spawning.includes("complete"), "spawned player Appear commands must remain fire-and-forget");
  assert(choosing.includes("return 0"), "choosing behavior must not expose animation timing");
  assert(spawning.includes("return 0"), "spawn behavior must not expose animation timing");
}

function checkWidgetReconciliation() {
  const timerSource = read("client/runtime/stageVisualControllers.ts");
  const timerPrepare = section(timerSource, "  prepareShownForAction(", "  render(timer:");
  const timerRender = section(timerSource, "  render(timer:", "\n}\n\nexport const PartyGameStageVisualControllers");
  assertAbsent(timerPrepare, ["playAll(", "setVisible("], "Set Timer Shown data preparation");
  assertAbsent(timerRender, ["playAll(", "setVisible("], "crafting timer reconciliation");

  const stageSource = read("client/runtime/stageRuntime.ts");
  const timerAction = section(stageSource, "async function setCraftingTimerShownForAction(", "function setStageWipeShownForAction(");
  assert(timerAction.includes("setStageLayoutGameObjectShownForStageAction("), "Set Timer Shown must use the placed layout GameObject lifecycle");
  assert(timerAction.includes('targetLayoutElementId'), "Set Timer Shown must target the placed crafting timer instance");
  assertAbsent(timerAction, ["playAll(", "stopAtAll(", "setVisible("], "Set Timer Shown lifecycle routing");

  const votingSource = read("client/runtime/stageVotingCardVisuals.ts");
  const votingRender = section(votingSource, "  render(cards", "  runAction(");
  assertAbsent(votingRender, ["revealAuthor(", "revealCorrectness(", "revealVoters(", "setShown("], "voting-card reconciliation");
}

function checkLayoutAuthority() {
  const source = read("client/runtime/layoutGameObjectRuntime.ts");
  const visibility = section(source, "function setLayoutEntityShownForAction(", "function setLayoutGameObjectShownForAction(");
  const animation = section(source, "function playLayoutEntityAnimationForAction(", "export const PartyGameLayoutGameObjects");
  assert(visibility.includes('action?.commandSource !== "flow-action"'), "layout visibility commands must require flow-action authority");
  assert(animation.includes('action?.commandSource !== "flow-action"'), "layout animation commands must require flow-action authority");
}

function checkArtRuntimeCssAuthority() {
  for (const relativePath of ["client/styles/legacy/stage-runtime.css", "client/styles/legacy-shell.css"]) {
    const source = read(relativePath);
    const baseRule = section(source, ".art-runtime-object {", ".art-runtime-object.is-shape");
    assert(!baseRule.includes("transition:"), `${relativePath} must not give Art Manager objects default CSS transitions`);
    assert(!source.includes(".art-runtime-object-update"), `${relativePath} must not define the legacy Art Manager update animation`);
    assert(!source.includes("@keyframes artRuntimeObjectUpdate"), `${relativePath} must not define legacy Art Manager motion keyframes`);
    const widgetHostRule = section(source, ".stage-widget-art-host.has-stage-widget-art {", "}");
    assert(widgetHostRule.includes("transition: none"), `${relativePath} must suppress outer transitions on Art Manager widget hosts`);
  }
  const stageCss = read("client/styles/legacy/stage-runtime.css");
  const wipeRule = section(stageCss, ".stage-wipe {", "}");
  for (const property of ["transition:", "animation:", "opacity:", "scale:", "transform:"]) {
    assert(!wipeRule.includes(property), `stage wipe host must not define programmatic ${property.slice(0, -1)}`);
  }
  const runtime = read("client/runtime/stageArtObjectVisuals.ts");
  assert(!runtime.includes('const EXITING_CLASS = "art-runtime-object-exiting"'), "Art Manager runtime must not register a legacy exiting class");
  assert(!runtime.includes('const UPDATE_CLASS = "art-runtime-object-update"'), "Art Manager runtime must not register a legacy update class");
  const gameObject = read("client/runtime/gameObject.ts");
  assert(gameObject.includes('options.exitingClass === ""'), "GameObject must preserve an explicitly disabled legacy exit class");
  assert(gameObject.includes('options.updateClass === ""'), "GameObject must preserve an explicitly disabled legacy update class");
  const wipeController = section(read("client/runtime/stageWipeController.ts"), "  setShown(isShown:", "  setShownForAction(");
  assertAbsent(wipeController, ["classList.add(", ".style.", "setTimeout(", "requestAnimationFrame("], "Set Wipe Shown");
}

function checkControllerAnimationAuthority() {
  for (const relativePath of ["client/styles/legacy/controller-runtime.css", "client/styles/legacy-shell.css"]) {
    const source = read(relativePath);
    const layoutRule = section(source, ".controller-layout-target {", "}");
    for (const forbidden of ["transition:", "opacity:", "--controller-visual-scale", "--controller-press-transform", "transform:"]) {
      assert(!layoutRule.includes(forbidden), `${relativePath} controller layout host must not define legacy ${forbidden}`);
    }
    assert(!source.includes("controllerLayoutVisualUpdate"), `${relativePath} must not define the legacy controller update keyframe`);
    assert(!source.includes(".primary-button.is-pressed"), `${relativePath} must not define legacy primary-button press motion`);
    assert(!source.includes(".choice-option-button.is-pressed"), `${relativePath} must not define legacy choice-button press motion`);
    assert(!source.includes(".controller-avatar.is-pressed"), `${relativePath} must not define legacy avatar-button press motion`);
    const artHostRule = section(source, ".controller-widget-art-host.has-controller-widget-art {", "}");
    for (const reset of ["transform: none", "filter: none", "transition: none", "animation: none"]) {
      assert(artHostRule.includes(reset), `${relativePath} controller art host must include ${reset}`);
    }
  }

  const utils = section(read("client/runtime/utils.ts"), "function bindControllerButtonTimelineStates(", "function getOrCreateStageCode(");
  assertAbsent(utils, ["is-pressed", "is-releasing", "setTimeout("], "controller button input states");
  for (const animation of ["Default", "Down", "Up", "HoverIn", "HoverOut"]) {
    assert(read("client/runtime/layoutRuntime.ts").includes(`\"${animation}\"`), `controller runtime must expose authored ${animation} interaction`);
  }

  const { defaultArtCompositions } = require("../shared/game-data");
  const { controllerButtonOverride } = require("../shared/controller-button-art");
  for (const parentId of ["controller-primary-button", "controller-choice-option", "controller-avatar-button"]) {
    const parent = defaultArtCompositions.find((composition) => composition.id === parentId);
    const interaction = defaultArtCompositions.find((composition) => composition.id === `${parentId}-interaction`);
    const state = defaultArtCompositions.find((composition) => composition.id === `${parentId}-state`);
    const art = defaultArtCompositions.find((composition) => composition.id === `${parentId}-art`);
    assert(parent && interaction && state && art, `${parentId} must use lifecycle -> interaction -> state -> art compositions`);
    assert(parent.components?.[0]?.artCompositionId === interaction.id, `${parentId} must directly reference its interaction MC`);
    assert(interaction.components?.[0]?.artCompositionId === state.id, `${parentId} interaction MC must directly reference its state MC`);
    assert(state.components?.[0]?.artCompositionId === art.id, `${parentId} state MC must directly reference its base art`);
    const labels = (composition) => (composition.timeline?.labels || []).map((label) => label.name);
    for (const name of ["Off", "On", "Appear", "Update", "Disappear"]) assert(labels(parent).includes(name), `${parentId} lifecycle is missing ${name}`);
    for (const name of ["Default", "Down", "Up", "HoverIn", "HoverOut"]) assert(labels(interaction).includes(name), `${parentId} interaction is missing ${name}`);
    for (const name of ["Default", "Disabled"]) assert(labels(state).includes(name), `${parentId} state is missing ${name}`);
  }
  const primary = defaultArtCompositions.find((composition) => composition.id === "controller-primary-button");
  const primaryArt = defaultArtCompositions.find((composition) => composition.id === "controller-primary-button-art");
  const legacyManifest = {
    "controller-primary-button": {
      canvas: { width: 301, height: 79 },
      components: [{ id: "legacy-card", kind: "shape", x: 150, y: 39, width: 300, height: 78 }]
    }
  };
  const migratedParent = controllerButtonOverride(primary, legacyManifest);
  const migratedArt = controllerButtonOverride(primaryArt, legacyManifest);
  assert(migratedParent.components?.[0]?.artCompositionId === "controller-primary-button-interaction", "legacy button parent must migrate to the nested interaction hierarchy");
  assert(migratedArt.components?.[0]?.id === "legacy-card", "legacy button artwork must migrate into the deepest base-art prefab");
}

try {
  checkStageReconciliation();
  checkPlayerExceptions();
  checkWidgetReconciliation();
  checkLayoutAuthority();
  checkArtRuntimeCssAuthority();
  checkControllerAnimationAuthority();
  console.log("Animation command authority checks passed.");
} catch (error) {
  console.error("Animation command authority checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
}
