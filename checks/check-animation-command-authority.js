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
  const timerRender = section(timerSource, "  render(timer:", "  renderLabel(");
  assertAbsent(timerRender, ["playAll(", "setVisible("], "crafting timer reconciliation");

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

try {
  checkStageReconciliation();
  checkPlayerExceptions();
  checkWidgetReconciliation();
  checkLayoutAuthority();
  checkArtRuntimeCssAuthority();
  console.log("Animation command authority checks passed.");
} catch (error) {
  console.error("Animation command authority checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
}
