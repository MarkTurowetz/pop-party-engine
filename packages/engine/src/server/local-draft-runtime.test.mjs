import { describe, expect, it, vi } from "vitest";
import localDraftModule from "./local-draft-runtime.js";

const { createLocalDraftRuntime } = localDraftModule;

function fixture(onDraftChanged, options = {}) {
  const responses = [];
  const localDraftStore = {};
  const identity = (value) => value;
  const onArtAssetsChanged = vi.fn();
  const broadcastLobby = vi.fn();
  const runtime = createLocalDraftRuntime({
    broadcastLobby,
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
    readJson: async () => options.payload || { constants: { gameTitle: "Browser model" } },
    resetCraftingTimer: vi.fn(),
    rooms: new Map(),
    onArtAssetsChanged,
    sendJson: (_res, status, payload) => responses.push({ status, payload }),
    syncControllerLayoutsWithFlow: identity,
    syncStageLayoutsWithFlow: identity
  });
  return { broadcastLobby, localDraftStore, onArtAssetsChanged, responses, runtime };
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

describe("local draft semantic change signaling", () => {
  it("does not announce an identical normalized Art draft twice", async () => {
    const payload = { artCompositions: [{ id: "widget", components: [] }] };
    const { onArtAssetsChanged, runtime } = fixture(null, { payload });

    await runtime.handleLocalDraft({}, {});
    await runtime.handleLocalDraft({}, {});

    expect(onArtAssetsChanged).toHaveBeenCalledOnce();
  });

  it("lets live-prototype room revision publication own Art reload signaling", async () => {
    const payload = { artCompositions: [{ id: "widget", components: [] }] };
    const { onArtAssetsChanged, runtime } = fixture(async () => ({
      artAssetsChangedHandled: true,
      roomContentChanged: true,
      workingRevision: "working-art-two"
    }), { payload });

    await runtime.handleLocalDraft({}, {});

    expect(onArtAssetsChanged).not.toHaveBeenCalled();
  });

  it("includes the changed content revision for modes that still emit Art events", async () => {
    const payload = { artCompositions: [{ id: "widget", components: [] }] };
    const { onArtAssetsChanged, runtime } = fixture(async () => ({
      roomContentChanged: true,
      workingRevision: "working-art-three"
    }), { payload });

    await runtime.handleLocalDraft({}, {});

    expect(onArtAssetsChanged).toHaveBeenCalledWith(expect.objectContaining({
      type: "art-draft",
      contentRevision: "working-art-three"
    }));
  });
});
