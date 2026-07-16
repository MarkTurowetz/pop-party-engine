import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { assertUniqueGameFlowIds, createToolPersistenceRuntime } = require("./tool-persistence-runtime");

describe("game flow persistence safeguards", () => {
  it("rejects duplicate nested action ids", () => {
    expect(() =>
      assertUniqueGameFlowIds({
        states: [
          {
            id: "lobby",
            actions: [
              { id: "duplicate" },
              { id: "parent", actions: [{ id: "duplicate" }] }
            ]
          }
        ]
      })
    ).toThrow(/Duplicate flow action id "duplicate"/);
  });

  it("writes the normalized flow instead of the unnormalized merge result", async () => {
    const existing = { states: [{ id: "lobby", actions: [] }], routeNodes: [] };
    const normalized = {
      states: [{ id: "lobby", actions: [{ id: "clean", type: "presentText" }] }],
      routeNodes: []
    };
    const writeJsonFile = vi.fn();
    const gameFlowStore = { storageKind: "local", source: existing, loadedAt: 0, error: "" };
    const runtime = createToolPersistenceRuntime({
      gameFlowFile: "game-flow.json",
      gameFlowBackupDir: "backups",
      gameFlowStore,
      readLocalGameFlowSource: () => existing,
      readGameFlowSource: () => gameFlowStore.source,
      mergeFlowWithExistingSubActions: (flow) => flow,
      normalizeGameFlow: () => normalized,
      backupJsonFile: vi.fn(),
      writeJsonFile
    });

    const saved = await runtime.writeGameFlow({
      states: [{ id: "lobby", actions: [{ id: "dirty", type: "presentText", stale: true }] }],
      routeNodes: []
    });

    expect(writeJsonFile).toHaveBeenCalledWith("game-flow.json", normalized);
    expect(saved).toEqual(normalized);
    expect(gameFlowStore.source).toEqual(normalized);
  });
});
