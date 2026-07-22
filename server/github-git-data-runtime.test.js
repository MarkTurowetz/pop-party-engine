import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGithubGitDataRuntime, normalizeRef } = require("./github-git-data-runtime");

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

describe("GitHub Git Data API", () => {
  it("normalizes only scoped branch refs", () => {
    expect(normalizeRef("refs/heads/game-data/draft")).toBe("heads/game-data/draft");
    expect(() => normalizeRef("heads/../main")).toThrow(/Invalid Git reference/);
    expect(() => normalizeRef("tags/release")).toThrow(/Invalid Git reference/);
  });

  it("uses an injected installation credential for immutable blobs", async () => {
    const fetchImpl = vi.fn(async () => response(201, { sha: "blob-sha" }));
    const runtime = createGithubGitDataRuntime({
      repo: "owner/game",
      credentialProvider: vi.fn(async () => "installation-token"),
      fetchImpl
    });
    await expect(runtime.createBlob(Buffer.from("hello"))).resolves.toBe("blob-sha");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/game/git/blobs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer installation-token" }),
        body: JSON.stringify({ content: Buffer.from("hello").toString("base64"), encoding: "base64" })
      })
    );
  });

  it("rejects a stale expected ref before attempting an update", async () => {
    const fetchImpl = vi.fn(async () => response(200, { object: { sha: "current" } }));
    const runtime = createGithubGitDataRuntime({ repo: "owner/game", token: "test", fetchImpl });
    await expect(runtime.updateRefCas("heads/game-data", "stale", "next")).rejects.toMatchObject({
      status: 409,
      code: "GITHUB_REF_CONFLICT",
      expectedSha: "stale",
      actualSha: "current"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a non-fast-forward race to a structured conflict", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(200, { object: { sha: "expected" } }))
      .mockResolvedValueOnce(response(422, { message: "Update is not a fast forward" }))
      .mockResolvedValueOnce(response(200, { object: { sha: "winner" } }));
    const runtime = createGithubGitDataRuntime({ repo: "owner/game", token: "test", fetchImpl });
    await expect(runtime.updateRefCas("heads/game-data", "expected", "ours")).rejects.toMatchObject({
      code: "GITHUB_REF_CONFLICT",
      actualSha: "winner"
    });
    const patchOptions = fetchImpl.mock.calls[1][1];
    expect(JSON.parse(patchOptions.body)).toEqual({ sha: "ours", force: false });
  });

  it("fails when GitHub truncates a recursive tree", async () => {
    const runtime = createGithubGitDataRuntime({
      repo: "owner/game",
      token: "test",
      fetchImpl: vi.fn(async () => response(200, { truncated: true, tree: [] }))
    });
    await expect(runtime.readTree("tree-sha")).rejects.toThrow(/truncated/);
  });
});
