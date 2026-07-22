import { describe, expect, it, vi } from "vitest";
import { createGameDataApi } from "./gameDataApi";
import {
  ApiValidationError,
  validateArtAssetReplaceResponse,
  validateArtCompositionDeleteResponse,
  validateArtCompositionSaveResponse,
  validateGameConstantsSaveResponse,
  validateGameFlowResponse,
  validateGameFlowSaveResponse,
  validateHostAudiosSaveResponse,
  validateLayoutResponse,
  validateLayoutSaveResponse
} from "./validators";
import type {
  ArtAssetReplaceResponse,
  ArtCompositionDeleteResponse,
  ArtCompositionSaveResponse,
  GameConstantsSaveResponse,
  GameFlowResponse,
  GameFlowSaveResponse,
  HostAudiosSaveResponse,
  LayoutResponse,
  LayoutSaveResponse,
  StageLayoutCollection
} from "../types/game-data";

function storage() {
  return {
    kind: "local",
    durable: false,
    error: "",
    repo: "",
    branch: "",
    path: ""
  };
}

function flowResponse(overrides: Partial<GameFlowResponse> = {}): GameFlowResponse {
  const flow = {
    states: [
      {
        id: "lobby",
        name: "Lobby",
        actions: []
      }
    ]
  };
  return {
    ok: true,
    flow,
    savedFlow: flow,
    runtimeFlow: flow,
    hasLocalDraft: false,
    storage: storage(),
    availableActionTypes: [],
    availableTransitions: [],
    ...overrides
  };
}

function flowSaveResponse(overrides: Partial<GameFlowSaveResponse> = {}): GameFlowSaveResponse {
  const flow = {
    states: [
      {
        id: "lobby",
        name: "Lobby",
        actions: []
      }
    ]
  };
  return {
    ok: true,
    flow,
    runtimeFlow: flow,
    storage: storage(),
    ...overrides
  };
}

function layoutsResponse(overrides: Partial<LayoutResponse<StageLayoutCollection>> = {}): LayoutResponse<StageLayoutCollection> {
  const layouts = {
    canvas: { width: 1920, height: 1080 },
    global: { id: "global", name: "Global Layout", elements: [] },
    states: [{ id: "lobby", name: "Lobby", elements: [] }]
  };
  return {
    ok: true,
    layouts,
    savedLayouts: layouts,
    hasLocalDraft: false,
    storage: storage(),
    ...overrides
  };
}

function layoutsSaveResponse(overrides: Partial<LayoutSaveResponse<StageLayoutCollection>> = {}): LayoutSaveResponse<StageLayoutCollection> {
  const layouts = {
    canvas: { width: 1920, height: 1080 },
    global: { id: "global", name: "Global Layout", elements: [] },
    states: [{ id: "lobby", name: "Lobby", elements: [] }]
  };
  return {
    ok: true,
    layouts,
    storage: storage(),
    ...overrides
  };
}

function constantsSaveResponse(overrides: Partial<GameConstantsSaveResponse> = {}): GameConstantsSaveResponse {
  return {
    ok: true,
    constants: { playerColors: [] },
    storage: storage(),
    ...overrides
  };
}

function hostAudiosSaveResponse(overrides: Partial<HostAudiosSaveResponse> = {}): HostAudiosSaveResponse {
  return {
    ok: true,
    hostAudios: { hostAudios: [] },
    storage: storage(),
    ...overrides
  };
}

function artComposition() {
  return {
    id: "badge",
    name: "Badge",
    description: "A badge",
    surface: "stage",
    canvas: { width: 560, height: 230 },
    components: []
  };
}

function artCompositionSaveResponse(overrides: Partial<ArtCompositionSaveResponse> = {}): ArtCompositionSaveResponse {
  return {
    ok: true,
    composition: artComposition(),
    ...overrides
  };
}

function artCompositionDeleteResponse(overrides: Partial<ArtCompositionDeleteResponse> = {}): ArtCompositionDeleteResponse {
  return {
    ok: true,
    compositions: [artComposition()],
    ...overrides
  };
}

function artAssetReplaceResponse(overrides: Partial<ArtAssetReplaceResponse> = {}): ArtAssetReplaceResponse {
  return {
    ok: true,
    asset: {
      id: "logo",
      name: "Logo",
      currentUrl: "/art/custom/logo.png",
      defaultUrl: "/art/default/logo.png",
      hasCustom: true
    },
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("API validators", () => {
  it("accepts a valid game flow response", () => {
    expect(validateGameFlowResponse(flowResponse()).flow.states[0]?.id).toBe("lobby");
  });

  it("rejects a game flow response without states", () => {
    const invalid = flowResponse({ flow: {} as GameFlowResponse["flow"] });
    expect(() => validateGameFlowResponse(invalid)).toThrow(ApiValidationError);
  });

  it("accepts the smaller game flow save response", () => {
    expect(validateGameFlowSaveResponse(flowSaveResponse()).flow.states[0]?.id).toBe("lobby");
  });

  it("accepts valid layout responses", () => {
    expect(validateLayoutResponse<StageLayoutCollection>(layoutsResponse(), "/api/stage-layouts").layouts.canvas.width).toBe(1920);
  });

  it("accepts smaller save responses for non-Flow tools", () => {
    expect(validateLayoutSaveResponse<StageLayoutCollection>(layoutsSaveResponse(), "/api/stage-layouts").layouts.canvas.width).toBe(1920);
    expect(validateGameConstantsSaveResponse(constantsSaveResponse()).constants.playerColors).toEqual([]);
    expect(validateHostAudiosSaveResponse(hostAudiosSaveResponse()).hostAudios.hostAudios).toEqual([]);
  });

  it("accepts art mutation responses", () => {
    expect(validateArtCompositionSaveResponse(artCompositionSaveResponse()).composition.id).toBe("badge");
    expect(validateArtCompositionDeleteResponse(artCompositionDeleteResponse()).compositions[0].id).toBe("badge");
    expect(validateArtAssetReplaceResponse(artAssetReplaceResponse()).asset.id).toBe("logo");
  });

  it("rejects layout responses with malformed canvas dimensions", () => {
    const invalidLayouts = {
      canvas: { width: "wide", height: 1080 },
      global: { id: "global", elements: [] },
      states: []
    } as unknown as StageLayoutCollection;
    expect(() => validateLayoutResponse(layoutsResponse({ layouts: invalidLayouts }), "/api/stage-layouts")).toThrow(ApiValidationError);
  });
});

describe("Game data API", () => {
  it("validates data loaded through the API wrapper", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(flowResponse()));
    const api = createGameDataApi({ fetchImpl });

    await expect(api.flow.loadGameFlow()).resolves.toMatchObject({
      ok: true,
      flow: { states: [{ id: "lobby" }] }
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/game-flow", {
      headers: { Accept: "application/json" }
    });
  });

  it("rejects malformed API payloads before they reach migrated tools", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, flow: { states: [] } }));
    const api = createGameDataApi({ fetchImpl });

    await expect(api.flow.loadGameFlow()).rejects.toThrow(ApiValidationError);
  });

  it("validates data saved through the API wrapper", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(flowSaveResponse()));
    const api = createGameDataApi({ fetchImpl });

    await expect(api.flow.saveGameFlow({ states: [] })).resolves.toMatchObject({
      ok: true,
      flow: { states: [{ id: "lobby" }] }
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/game-flow", {
      body: JSON.stringify({ flow: { states: [] } }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      method: "POST"
    });
  });

  it("validates smaller save payloads for migrated non-Flow APIs", async () => {
    const fetchImpl = vi.fn(async (path: string) => {
      if (path === "/api/stage-layouts") return jsonResponse(layoutsSaveResponse());
      if (path === "/api/game-constants") return jsonResponse(constantsSaveResponse());
      if (path === "/api/host-audios") return jsonResponse(hostAudiosSaveResponse());
      return jsonResponse({});
    });
    const api = createGameDataApi({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(api.layout.saveStageLayouts(layoutsSaveResponse().layouts)).resolves.toMatchObject({ ok: true, layouts: { states: [{ id: "lobby" }] } });
    await expect(api.constants.saveGameConstants({ playerColors: [] })).resolves.toMatchObject({ ok: true, constants: { playerColors: [] } });
    await expect(api.hostAudio.saveHostAudios({ hostAudios: [] })).resolves.toMatchObject({ ok: true, hostAudios: { hostAudios: [] } });
  });

  it("validates art mutation payloads for migrated APIs", async () => {
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/art-compositions/badge" && init?.method === "DELETE") return jsonResponse(artCompositionDeleteResponse());
      if (path === "/api/art-compositions/badge") return jsonResponse(artCompositionSaveResponse());
      if (path === "/api/art-assets/logo") return jsonResponse(artAssetReplaceResponse());
      return jsonResponse({});
    });
    const api = createGameDataApi({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(api.art.saveArtComposition("badge", artComposition())).resolves.toMatchObject({ ok: true, composition: { id: "badge" } });
    await expect(api.art.deleteArtComposition("badge")).resolves.toMatchObject({ ok: true, compositions: [{ id: "badge" }] });
    await expect(api.art.replaceArtAsset("logo", { dataUrl: "data:image/png;base64,AAAA" })).resolves.toMatchObject({ ok: true, asset: { id: "logo" } });
  });

  it("remembers a newer art revision after a rejected save so retry can persist", async () => {
    let attempts = 0;
    const requestBodies: unknown[] = [];
    const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
      if (path !== "/api/art-compositions/badge") return jsonResponse({});
      requestBodies.push(JSON.parse(String(init?.body || "{}")));
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({
          ok: false,
          error: "Art manifest changed",
          revision: "fresh-revision",
          compositionRevisions: { badge: "fresh-badge-revision" }
        }, 409);
      }
      return jsonResponse(artCompositionSaveResponse({ revision: "saved-revision" }));
    });
    const api = createGameDataApi({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(api.art.saveArtComposition("badge", artComposition())).rejects.toThrow("Art manifest changed");
    await expect(api.art.saveArtComposition("badge", artComposition())).resolves.toMatchObject({ ok: true });

    expect(requestBodies[1]).toMatchObject({
      revision: "fresh-revision",
      expectedCompositionRevisions: { badge: "fresh-badge-revision" }
    });
  });
});
