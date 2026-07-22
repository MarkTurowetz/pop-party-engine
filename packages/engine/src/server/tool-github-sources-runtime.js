"use strict";

function createToolGithubSourcesRuntime({
  gameFlowPath,
  githubStorage
}) {
  async function readGithubJsonSource(filePath) {
    return githubStorage.readJson(filePath);
  }

  async function writeGithubJsonSource(data, sha = "", filePath = gameFlowPath, messagePrefix = "Save JSON") {
    return githubStorage.writeJson(data, { filePath, messagePrefix, sha });
  }

  async function readGithubGameFlowSource() {
    const result = await readGithubJsonSource(gameFlowPath);
    return result ? { flow: result.data, sha: result.sha } : null;
  }

  async function writeGithubGameFlowSource(flow, sha = "") {
    const result = await writeGithubJsonSource(flow, sha, gameFlowPath, "Save game flow");
    return { flow: result.data, sha: result.sha };
  }

  return {
    readGithubGameFlowSource,
    readGithubJsonSource,
    writeGithubGameFlowSource,
    writeGithubJsonSource
  };
}

module.exports = { createToolGithubSourcesRuntime };
