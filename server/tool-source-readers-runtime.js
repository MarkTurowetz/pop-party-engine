function createToolSourceReadersRuntime({
  cloneJson,
  controllerLayoutsFile,
  defaultControllerLayouts,
  defaultControllerLayoutsFile,
  defaultGameConstants,
  defaultGameConstantsFile,
  defaultGameFlow,
  defaultGameFlowFile,
  defaultHostAudios,
  defaultHostAudiosFile,
  defaultStageLayouts,
  defaultStageLayoutsFile,
  gameConstantsFile,
  gameFlowFile,
  hostAudiosFile,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeHostAudios,
  normalizeStageLayouts,
  readJsonFile,
  stageLayoutsFile
}) {
  function readDefaultGameFlowSource() {
    try {
      return readJsonFile(defaultGameFlowFile);
    } catch (error) {
      return cloneJson(defaultGameFlow);
    }
  }

  function readDefaultGameConstantsSource() {
    try {
      return normalizeGameConstants(readJsonFile(defaultGameConstantsFile));
    } catch (error) {
      return cloneJson(defaultGameConstants);
    }
  }

  function readDefaultStageLayoutsSource() {
    try {
      return normalizeStageLayouts(readJsonFile(defaultStageLayoutsFile));
    } catch (error) {
      return normalizeStageLayouts(defaultStageLayouts);
    }
  }

  function readDefaultHostAudiosSource() {
    try {
      return normalizeHostAudios(readJsonFile(defaultHostAudiosFile));
    } catch (error) {
      return normalizeHostAudios(defaultHostAudios);
    }
  }

  function readDefaultControllerLayoutsSource() {
    try {
      return normalizeControllerLayouts(readJsonFile(defaultControllerLayoutsFile));
    } catch (error) {
      return normalizeControllerLayouts(defaultControllerLayouts);
    }
  }

  function readLocalGameFlowSource() {
    try {
      return readJsonFile(gameFlowFile);
    } catch (error) {
      return readDefaultGameFlowSource();
    }
  }

  function readLocalGameConstantsSource() {
    try {
      return normalizeGameConstants(readJsonFile(gameConstantsFile));
    } catch (error) {
      return readDefaultGameConstantsSource();
    }
  }

  function readLocalStageLayoutsSource() {
    try {
      return normalizeStageLayouts(readJsonFile(stageLayoutsFile));
    } catch (error) {
      return readDefaultStageLayoutsSource();
    }
  }

  function readLocalControllerLayoutsSource() {
    try {
      return normalizeControllerLayouts(readJsonFile(controllerLayoutsFile));
    } catch (error) {
      return readDefaultControllerLayoutsSource();
    }
  }

  function readLocalHostAudiosSource() {
    try {
      return normalizeHostAudios(readJsonFile(hostAudiosFile));
    } catch (error) {
      return readDefaultHostAudiosSource();
    }
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
