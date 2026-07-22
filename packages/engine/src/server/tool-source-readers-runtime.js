"use strict";

const fs = require("fs");

function createToolSourceReadersRuntime({
  controllerLayoutsFile,
  defaultControllerLayoutsFile,
  defaultGameConstantsFile,
  defaultGameFlowFile,
  defaultHostAudiosFile,
  defaultStageLayoutsFile,
  gameConstantsFile,
  gameFlowFile,
  hostAudiosFile,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeHostAudios,
  normalizeStageLayouts,
  readJsonFile,
  sourceFileExists = fs.existsSync,
  stageLayoutsFile
}) {
  function readRequiredSource(file, normalize = (value) => value) {
    if (!sourceFileExists(file)) {
      throw new Error(`Required game content file is missing: ${file}`);
    }
    return normalize(readJsonFile(file));
  }

  function readLocalOrSeed(localFile, readSeed, normalize = (value) => value) {
    if (!sourceFileExists(localFile)) return readSeed();
    return normalize(readJsonFile(localFile));
  }

  function readDefaultGameFlowSource() {
    return readRequiredSource(defaultGameFlowFile);
  }

  function readDefaultGameConstantsSource() {
    return readRequiredSource(defaultGameConstantsFile, normalizeGameConstants);
  }

  function readDefaultStageLayoutsSource() {
    return readRequiredSource(defaultStageLayoutsFile, normalizeStageLayouts);
  }

  function readDefaultHostAudiosSource() {
    return readRequiredSource(defaultHostAudiosFile, normalizeHostAudios);
  }

  function readDefaultControllerLayoutsSource() {
    return readRequiredSource(defaultControllerLayoutsFile, normalizeControllerLayouts);
  }

  function readLocalGameFlowSource() {
    return readLocalOrSeed(gameFlowFile, readDefaultGameFlowSource);
  }

  function readLocalGameConstantsSource() {
    return readLocalOrSeed(gameConstantsFile, readDefaultGameConstantsSource, normalizeGameConstants);
  }

  function readLocalStageLayoutsSource() {
    return readLocalOrSeed(stageLayoutsFile, readDefaultStageLayoutsSource, normalizeStageLayouts);
  }

  function readLocalControllerLayoutsSource() {
    return readLocalOrSeed(controllerLayoutsFile, readDefaultControllerLayoutsSource, normalizeControllerLayouts);
  }

  function readLocalHostAudiosSource() {
    return readLocalOrSeed(hostAudiosFile, readDefaultHostAudiosSource, normalizeHostAudios);
  }

  return {
    readDefaultControllerLayoutsSource,
    readDefaultGameConstantsSource,
    readDefaultGameFlowSource,
    readDefaultHostAudiosSource,
    readDefaultStageLayoutsSource,
    readLocalControllerLayoutsSource,
    readLocalGameConstantsSource,
    readLocalGameFlowSource,
    readLocalHostAudiosSource,
    readLocalStageLayoutsSource
  };
}

module.exports = { createToolSourceReadersRuntime };
