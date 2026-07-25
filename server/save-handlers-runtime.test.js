import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { validateLayoutSaveResponse } from "../client/api/validators";

const require = createRequire(import.meta.url);
const { createSaveHandlersRuntime } = require("./save-handlers-runtime");

function store(storageKind = "github") {
  return { storageKind, error: "" };
}

function createHarness(payload, overrides = {}) {
  let response = null;
  const writeControllerLayouts = overrides.writeControllerLayouts || vi.fn(async (layouts) => layouts);
  const runtime = createSaveHandlersRuntime({
    broadcastLobby: vi.fn(),
    clearActionTimer: vi.fn(),
    clearAppliedActionEffects: vi.fn(),
    controllerLayoutsPath: "controller-layouts.json",
    controllerLayoutsStore: store(),
    gameConstantsPath: "game-constants.json",
    gameConstantsStore: store(),
    gameFlowPath: "game-flow.json",
    gameFlowStore: store(),
    githubBranch: "game-data",
    githubRepo: "MarkTurowetz/pop-party",
    hasGithubToken: () => true,
    hostAudiosPath: "host-audios.json",
    hostAudiosStore: store(),
    localDraftStore: {},
    normalizeGameFlow: (flow) => flow,
    normalizeHostAudios: (hostAudios) => hostAudios,
    onSaved: overrides.onSaved,
    preserveActiveRooms: overrides.preserveActiveRooms,
    readJson: async () => payload,
    resetCraftingTimer: vi.fn(),
    rooms: overrides.rooms || new Map(),
    sendJson: (_res, status, body) => {
      response = { status, body };
    },
    stageLayoutsPath: "stage-layouts.json",
    stageLayoutsStore: store(),
    writeControllerLayouts,
    writeGameConstants: vi.fn(),
    writeGameFlow: overrides.writeGameFlow || vi.fn(async (flow) => flow),
    writeHostAudios: vi.fn(),
    writeStageLayouts: vi.fn()
  });
  return { runtime, writeControllerLayouts, response: () => response };
}

describe("tool save response contract", () => {
  it("saves controller Off states and returns complete durable-storage metadata", async () => {
    const layouts = {
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [{
        id: "controller-multiple-choice",
        name: "Multiple Choice",
        elements: [
          { id: "controllerChoicePrompt", defaultAnimationState: "Off" },
          { id: "controllerChoiceGrid", defaultAnimationState: "Off" }
        ]
      }]
    };
    const harness = createHarness({ layouts });

    await harness.runtime.handleSaveControllerLayouts({}, {});

    expect(harness.writeControllerLayouts).toHaveBeenCalledWith(layouts);
    expect(harness.response()).toEqual({
      status: 200,
      body: {
        ok: true,
        layouts,
        storage: {
          kind: "github",
          durable: true,
          error: "",
          repo: "MarkTurowetz/pop-party",
          branch: "game-data",
          path: "controller-layouts.json"
        }
      }
    });
    expect(() => validateLayoutSaveResponse(harness.response().body, "/api/controller-layouts")).not.toThrow();
  });

  it("returns stale revision conflicts without hiding them as validation failures", async () => {
    const conflict = Object.assign(new Error("sha does not match"), {
      code: "CONTENT_REVISION_CONFLICT",
      status: 409
    });
    const writeControllerLayouts = vi.fn(async () => {
      throw conflict;
    });
    const harness = createHarness({ layouts: { states: [] } }, { writeControllerLayouts });

    await harness.runtime.handleSaveControllerLayouts({}, {});

    expect(writeControllerLayouts).toHaveBeenCalledTimes(1);
    expect(harness.response()).toEqual({
      status: 409,
      body: {
        ok: false,
        error: "Controller layouts could not be saved: sha does not match",
        errorCode: "CONTENT_REVISION_CONFLICT"
      }
    });
  });

  it("refreshes the next authoring snapshot without disturbing active rooms", async () => {
    const room = {
      actionIndex: 4,
      subroutinePath: ["nested"],
      subroutineStack: [{ actionIndex: 2 }]
    };
    const onSaved = vi.fn(async () => {});
    const harness = createHarness(
      { flow: { states: [{ id: "lobby", actions: [] }] } },
      {
        onSaved,
        preserveActiveRooms: true,
        rooms: new Map([["ABCD", room]])
      }
    );

    await harness.runtime.handleSaveGameFlow({}, {});

    expect(room).toEqual({
      actionIndex: 4,
      subroutinePath: ["nested"],
      subroutineStack: [{ actionIndex: 2 }]
    });
    expect(onSaved).toHaveBeenCalledWith({
      label: "Game flow",
      saved: { states: [{ id: "lobby", actions: [] }] }
    });
    expect(harness.response().status).toBe(200);
  });
});
