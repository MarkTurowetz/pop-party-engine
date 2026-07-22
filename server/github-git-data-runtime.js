"use strict";

class GithubRefConflictError extends Error {
  constructor(message, { ref = "", expectedSha = "", actualSha = "" } = {}) {
    super(message);
    this.name = "GithubRefConflictError";
    this.code = "GITHUB_REF_CONFLICT";
    this.status = 409;
    this.ref = ref;
    this.expectedSha = expectedSha;
    this.actualSha = actualSha;
  }
}

function normalizeRef(value) {
  const ref = String(value || "").replace(/^refs\//, "");
  if (!/^heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(ref) || ref.includes("..") || ref.endsWith("/") || ref.includes("//")) {
    throw new Error(`Invalid Git reference: ${String(value || "")}`);
  }
  return ref;
}

function createGithubGitDataRuntime(options = {}) {
  const repo = String(options.repo || "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GitHub repository must be owner/name");
  const fetchImpl = options.fetchImpl || fetch;
  const credentialProvider = options.credentialProvider || (async () => String(options.token || ""));
  const userAgent = options.userAgent || "pop-party-engine";

  async function request(pathname, requestOptions = {}) {
    const credential = await credentialProvider();
    if (!credential) throw new Error("GitHub writer credential is unavailable");
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${pathname}`, {
      ...requestOptions,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${credential}`,
        "User-Agent": userAgent,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(requestOptions.headers || {})
      }
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_error) {
      throw new Error(`GitHub returned invalid JSON with status ${response.status}`);
    }
    if (!response.ok) {
      const error = new Error(data?.message || `GitHub request failed with ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function getRef(refInput) {
    const ref = normalizeRef(refInput);
    try {
      const data = await request(`/git/ref/${ref}`);
      return { ref, sha: String(data?.object?.sha || "") };
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function createRef(refInput, sha) {
    const ref = normalizeRef(refInput);
    const data = await request("/git/refs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/${ref}`, sha: String(sha || "") })
    });
    return { ref, sha: String(data?.object?.sha || sha || "") };
  }

  async function ensureRef(refInput, baseRefInput = "heads/main") {
    const ref = normalizeRef(refInput);
    const existing = await getRef(ref);
    if (existing) return existing;
    const base = await getRef(normalizeRef(baseRefInput));
    if (!base?.sha) throw new Error(`Base Git reference does not exist: ${baseRefInput}`);
    try {
      return await createRef(ref, base.sha);
    } catch (error) {
      if (error.status !== 422) throw error;
      const raced = await getRef(ref);
      if (!raced) throw error;
      return raced;
    }
  }

  async function getCommit(sha) {
    const data = await request(`/git/commits/${encodeURIComponent(String(sha || ""))}`);
    return {
      sha: String(data?.sha || sha || ""),
      treeSha: String(data?.tree?.sha || ""),
      parentShas: Array.isArray(data?.parents) ? data.parents.map((parent) => String(parent.sha || "")) : [],
      message: String(data?.message || "")
    };
  }

  async function createBlob(bytes) {
    const data = await request("/git/blobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: Buffer.from(bytes).toString("base64"), encoding: "base64" })
    });
    return String(data?.sha || "");
  }

  async function readBlob(sha) {
    const data = await request(`/git/blobs/${encodeURIComponent(String(sha || ""))}`);
    if (data?.encoding !== "base64") throw new Error(`Unsupported Git blob encoding: ${String(data?.encoding || "")}`);
    return Buffer.from(String(data.content || "").replace(/\s/g, ""), "base64");
  }

  async function createTree(entries) {
    const tree = entries.map((entry) => ({
      path: String(entry.path || ""),
      mode: entry.mode || "100644",
      type: "blob",
      sha: String(entry.sha || "")
    }));
    const data = await request("/git/trees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree })
    });
    return String(data?.sha || "");
  }

  async function readTree(treeSha) {
    const data = await request(`/git/trees/${encodeURIComponent(String(treeSha || ""))}?recursive=1`);
    if (data?.truncated) throw new Error("GitHub tree response was truncated");
    return (Array.isArray(data?.tree) ? data.tree : [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({ path: String(entry.path || ""), sha: String(entry.sha || ""), bytes: Number(entry.size || 0) }));
  }

  async function createCommit({ message, treeSha, parentSha }) {
    const data = await request("/git/commits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(message || ""), tree: String(treeSha || ""), parents: parentSha ? [String(parentSha)] : [] })
    });
    return String(data?.sha || "");
  }

  async function updateRefCas(refInput, expectedSha, nextSha) {
    const ref = normalizeRef(refInput);
    const current = await getRef(ref);
    const actualSha = String(current?.sha || "");
    if (actualSha !== String(expectedSha || "")) {
      throw new GithubRefConflictError("Git reference changed before update", { ref, expectedSha: String(expectedSha || ""), actualSha });
    }
    try {
      const data = await request(`/git/refs/${ref}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: String(nextSha || ""), force: false })
      });
      return { ref, sha: String(data?.object?.sha || nextSha || "") };
    } catch (error) {
      if (error.status !== 409 && error.status !== 422) throw error;
      const latest = await getRef(ref);
      throw new GithubRefConflictError("Git reference changed during update", {
        ref,
        expectedSha: String(expectedSha || ""),
        actualSha: String(latest?.sha || "")
      });
    }
  }

  return Object.freeze({
    createBlob,
    createCommit,
    createRef,
    createTree,
    ensureRef,
    getCommit,
    getRef,
    readBlob,
    readTree,
    updateRefCas
  });
}

module.exports = { GithubRefConflictError, createGithubGitDataRuntime, normalizeRef };
