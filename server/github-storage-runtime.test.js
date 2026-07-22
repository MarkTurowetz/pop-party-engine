import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGithubStorageRuntime } = require("./github-storage-runtime");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}

describe("legacy GitHub storage conflicts", () => {
  it("surfaces a stale SHA conflict without reloading and overwriting", async () => {
    globalThis.fetch = vi.fn(async () => response(409, { message: "sha does not match" }));
    const storage = createGithubStorageRuntime({
      baseBranch: "game-data",
      branch: "game-data",
      repo: "owner/game",
      token: "test"
    });

    await expect(storage.writeJson({ value: 2 }, {
      filePath: "flow.json",
      messagePrefix: "Save flow",
      sha: "stale-sha"
    })).rejects.toMatchObject({ status: 409, message: "sha does not match" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
