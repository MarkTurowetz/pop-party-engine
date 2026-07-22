import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createToolGithubSourcesRuntime } = require("./tool-github-sources-runtime");

describe("tool GitHub source conflicts", () => {
  it("surfaces a stale flow SHA without reloading, merging, or retrying", async () => {
    const conflict = Object.assign(new Error("sha does not match"), {
      code: "CONTENT_REVISION_CONFLICT",
      status: 409
    });
    const githubStorage = {
      readJson: vi.fn(),
      writeJson: vi.fn(async () => {
        throw conflict;
      })
    };
    const runtime = createToolGithubSourcesRuntime({
      gameFlowPath: "game-flow.json",
      githubStorage
    });

    await expect(runtime.writeGithubGameFlowSource({ states: [] }, "stale-sha"))
      .rejects.toBe(conflict);
    expect(githubStorage.writeJson).toHaveBeenCalledTimes(1);
    expect(githubStorage.readJson).not.toHaveBeenCalled();
  });
});
