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

try {
  checkStageReconciliation();
  checkPlayerExceptions();
  checkWidgetReconciliation();
  checkLayoutAuthority();
  console.log("Animation command authority checks passed.");
} catch (error) {
  console.error("Animation command authority checks failed:");
  console.error(`- ${error.message}`);
  process.exit(1);
}
