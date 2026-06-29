import { describe, expect, it, vi } from "vitest";
import { createArtAssetsController } from "./artAssetsController";
import type { ArtApi } from "../../api/artApi";
import type { ArtAsset, ArtAssetReplaceResponse } from "../../types/game-data";

function asset(id: string, hasCustom = false): ArtAsset {
  return { id, name: id, currentUrl: `${id}.png`, defaultUrl: `${id}-default.png`, hasCustom };
}

function fakeApi(overrides: Partial<ArtApi> = {}): ArtApi {
  return {
    loadArtAssets: vi.fn(),
    saveArtComposition: vi.fn(),
    saveArtOrganization: vi.fn(),
    deleteArtComposition: vi.fn(),
    replaceArtAsset: vi.fn(
      async (assetId: string) =>
        ({ ok: true, asset: { ...asset(assetId, true), currentUrl: `${assetId}-custom.png` } }) as unknown as ArtAssetReplaceResponse
    ),
    ...overrides
  } as ArtApi;
}

const replacement = { fileName: "x.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AAA" };

describe("createArtAssetsController", () => {
  it("starts clean with the loaded assets", () => {
    const controller = createArtAssetsController({ initialAssets: [asset("a"), asset("b")], api: fakeApi() });
    expect(controller.getState().assets).toHaveLength(2);
    expect(controller.getState().dirty).toBe(false);
  });

  it("stages and clears a replacement", () => {
    const controller = createArtAssetsController({ initialAssets: [asset("a")], api: fakeApi() });
    controller.stageReplacement("a", replacement);
    expect(controller.getState().dirty).toBe(true);
    expect(controller.getState().pending.get("a")?.fileName).toBe("x.png");
    controller.clearReplacement("a");
    expect(controller.getState().dirty).toBe(false);
  });

  it("saves staged replacements and updates assets", async () => {
    const api = fakeApi();
    const controller = createArtAssetsController({ initialAssets: [asset("a")], api });
    controller.stageReplacement("a", replacement);
    const ok = await controller.save();
    expect(ok).toBe(true);
    expect(api.replaceArtAsset).toHaveBeenCalledWith("a", replacement);
    expect(controller.getState().dirty).toBe(false);
    expect(controller.getState().assets[0].currentUrl).toBe("a-custom.png");
    expect(controller.getState().assets[0].hasCustom).toBe(true);
  });
});
