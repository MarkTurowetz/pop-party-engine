"use strict";

const {
  applyCustomConstantsToObject,
  normalizeCustomConstants
} = require("../shared/game-constants-schema");

function createGameConstantsRuntime({
  defaultGameConstants,
  defaultPlayerColors,
  normalizeColor,
  normalizeConstantFloat,
  normalizeConstantInteger,
  normalizeConstantString,
  normalizeDurationSeconds
}) {
  function normalizeGameConstants(constants) {
    const colors = Array.isArray(constants?.playerColors) ? constants.playerColors : defaultPlayerColors;
    const playerColors = [...new Set(colors.map(normalizeColor).filter(Boolean))];
    const craftingTimerDuration = normalizeDurationSeconds(constants?.craftingTimerDuration, defaultGameConstants.craftingTimerDuration);
    const startGameCountdownDuration = normalizeDurationSeconds(constants?.startGameCountdownDuration, defaultGameConstants.startGameCountdownDuration);
    const pointsForCorrectAnswer = normalizeConstantInteger(constants?.pointsForCorrectAnswer, defaultGameConstants.pointsForCorrectAnswer || 200, 0, 999999);
    const speechToTextSendInputBuffer = normalizeConstantFloat(constants?.speechToTextSendInputBuffer, defaultGameConstants.speechToTextSendInputBuffer || 1, 0, 10);
    const customConstants = normalizeCustomConstants(constants);
    const normalized = {
      playerColors: playerColors.length ? playerColors : [...defaultPlayerColors],
      craftingTimerDuration,
      startGameCountdownDuration,
      pointsForCorrectAnswer,
      gameTitle: normalizeConstantString(constants?.gameTitle, defaultGameConstants.gameTitle),
      numberOfRounds: normalizeConstantInteger(constants?.numberOfRounds, defaultGameConstants.numberOfRounds, 1, 99),
      randomChanceTest: normalizeConstantFloat(constants?.randomChanceTest, defaultGameConstants.randomChanceTest, 0, 1),
      speechToTextSendInputBuffer,
      overrideFirstGameOfSession: constants?.overrideFirstGameOfSession === true,
      customConstants
    };
    return applyCustomConstantsToObject(normalized, customConstants);
  }

  return { normalizeGameConstants };
}

module.exports = { createGameConstantsRuntime };
