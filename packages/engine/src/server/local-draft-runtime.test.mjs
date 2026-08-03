import { describe, expect, it, vi } from "vitest";
import localDraftModule from "./local-draft-runtime.js";

const { createLocalDraftRuntime } = localDraftModule;

function fixture(onDraftChanged) {
  const responses = [];
  const localDraftStore = {};
  const identity = (value) => value;
  const runtime = createLocalDraftRuntime({
    broadcastLobby: vi.fn(),
    clearActionTimer: vi.fn(),
    clearAppliedActionEffects: vi.fn(),
    localDraftStore,
    normalizeArtAssetReplacementsDraft: identity,
    normalizeControllerLayouts: identity,
    normalizeArtCompositionsDraft: identity,
    normalizeArtOrganization: identity,
    normalizeGameConstants: identity,
    normalizeGameFlow: identity,
    normalizeHostAudios: identity,
    normalizeStageLayouts: identity,
    onDraftChanged,
    readGameFlow: () => ({ states: [] }),
    readJson: async () => ({ constants: { gameTitle: "Browser model" } }),
    resetCraftingTimer: vi.fn(),
    rooms: new Map(),
    sendJson: (_res, status, payload) => responses.push({ status, payload }),
    syncControllerLayoutsWithFlow: identity,
    syncStageLayoutsWithFlow: identity
  });
  return { localDraftStore, responses, runtime };
}

describe("local draft authoring boundary errors", () => {
  it("reports stale sessions as transport faults rather than invalid content", async () => {
    const stale = Object.assign(new Error("The live prototype authoring session is no longer active"), {
      code: "AUTHORING_SESSION_STALE",
      status: 409
    });
    const { localDraftStore, responses, runtime } = fixture(async () => {
      throw stale;
    });

    await runtime.handleLocalDraft({}, {});

    expect(responses).toEqual([{
      status: 409,
      payload: expect.objectContaining({
        error: stale.message,
        errorCode: "AUTHORING_SESSION_STALE",
        errorCategory: "authoring-session"
      })
    }]);
    expect(localDraftStore.constants).toBeUndefined();
  });

  it("keeps genuine bundle validation errors classified as authored-content faults", async () => {
    const invalid = Object.assign(new Error("The constants are incomplete"), {
      code: "BUNDLE_GAME_DATA_INVALID",
      status: 400
    });
    const { responses, runtime } = fixture(async () => {
      throw invalid;
    });

    await runtime.handleLocalDraft({}, {});

    expect(responses[0]).toMatchObject({
      status: 400,
      payload: {
        error: "Working bundle is invalid: The constants are incomplete",
        errorCode: "BUNDLE_GAME_DATA_INVALID",
        errorCategory: "content-validation"
      }
    });
  });
});
