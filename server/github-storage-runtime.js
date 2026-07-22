function createGithubStorageRuntime({
  baseBranch,
  branch,
  repo,
  token,
  userAgent = "party-game-template"
}) {
  function headers() {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "User-Agent": userAgent,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  async function request(pathname, options = {}) {
    const response = await fetch(`https://api.github.com${pathname}`, {
      ...options,
      headers: {
        ...headers(),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.message || `GitHub request failed with ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function repoPath() {
    return `/repos/${repo}`;
  }

  function contentPath(filePath) {
    return filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  }

  async function ensureBranch() {
    if (branch === baseBranch) return;
    try {
      await request(`${repoPath()}/git/ref/heads/${branch}`);
      return;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const baseRef = await request(`${repoPath()}/git/ref/heads/${baseBranch}`);
    await request(`${repoPath()}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha
      })
    });
  }

  async function readJson(filePath) {
    await ensureBranch();
    try {
      const file = await request(`${repoPath()}/contents/${contentPath(filePath)}?ref=${encodeURIComponent(branch)}`);
      if (!file?.content) return null;
      const json = Buffer.from(file.content, "base64").toString("utf8");
      return { data: JSON.parse(json), sha: file.sha || "" };
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function writeJson(data, options = {}) {
    const {
      filePath,
      messagePrefix = "Save JSON",
      sha = ""
    } = options;
    await ensureBranch();
    const payload = {
      message: `${messagePrefix} ${new Date().toISOString()}`,
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`).toString("base64"),
      branch
    };
    if (sha) payload.sha = sha;
    const result = await request(`${repoPath()}/contents/${contentPath(filePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { data, sha: result?.content?.sha || "" };
  }

  return {
    readJson,
    writeJson
  };
}

module.exports = { createGithubStorageRuntime };
