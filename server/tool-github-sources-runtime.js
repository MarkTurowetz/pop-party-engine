function createToolGithubSourcesRuntime({
  gameFlowPath,
  githubStorage,
  mergeFlowWithExistingSubActions
}) {
  async function readGithubJsonSource(filePath) {
    return githubStorage.readJson(filePath);
  }

  async function writeGithubJsonSource(data, sha = "", filePath = gameFlowPath, messagePrefix = "Save JSON", retryConflict = true) {
    return githubStorage.writeJson(data, { filePath, messagePrefix, retryConflict, sha });
  }

  async function readGithubGameFlowSource() {
    const result = await readGithubJsonSource(gameFlowPath);
    return result ? { flow: result.data, sha: result.sha } : null;
  }

  async function writeGithubGameFlowSource(flow, sha = "") {
    try {
      const result = await writeGithubJsonSource(flow, sha, gameFlowPath, "Save game flow", false);
      return { flow: result.data, sha: result.sha };
    } catch (error) {
      if (error.status !== 409 || !sha) throw error;
      const latest = await readGithubGameFlowSource();
      const merged = mergeFlowWithExistingSubActions(flow, latest?.flow || {});
      return writeGithubGameFlowSource(merged, latest?.sha || "");
    }
  }

  return {
    readGithubGameFlowSource,
    readGithubJsonSource,
    writeGithubGameFlowSource,
    writeGithubJsonSource
  };
}

module.exports = { createToolGithubSourcesRuntime };
