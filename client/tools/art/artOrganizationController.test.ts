import { describe, expect, it, vi } from "vitest";
import { createArtOrganizationController } from "./artOrganizationController";
import { emptyOrganization, itemKey } from "./organizationModel";
import type { ArtApi } from "../../api/artApi";
import type { ArtComposition, ArtOrganizationSaveResponse } from "../../types/game-data";

function composition(id: string, surface = "stage"): ArtComposition {
  return { id, name: id, surface, canvas: { width: 1, height: 1 }, components: [] };
}

function fakeApi(overrides: Partial<ArtApi> = {}): ArtApi {
  return {
    loadArtAssets: vi.fn(),
    saveArtComposition: vi.fn(),
    saveArtOrganization: vi.fn(
      async (organization) => ({ ok: true, organization }) as unknown as ArtOrganizationSaveResponse
    ),
    deleteArtComposition: vi.fn(),
    replaceArtAsset: vi.fn(),
    ...overrides
  } as ArtApi;
}

const comps = [composition("a"), composition("b"), composition("c")];

describe("createArtOrganizationController", () => {
  it("creates a folder and moves an item into it, marking dirty", () => {
    const controller = createArtOrganizationController({
      initialOrganization: emptyOrganization(),
      compositions: comps,
      assets: [],
      api: fakeApi()
    });
    expect(controller.getState().dirty).toBe(false);

    controller.createFolder("stage", "Group");
    const folderId = controller.getState().organization.stage.folders[0].id;
    controller.moveIntoFolder("stage", itemKey(comps[0]), folderId);

    expect(controller.getState().organization.stage.folderItems[folderId]).toContain("composition:a");
    expect(controller.getState().dirty).toBe(true);
  });

  it("reorders items beside a target", () => {
    const controller = createArtOrganizationController({
      initialOrganization: emptyOrganization(),
      compositions: comps,
      assets: [],
      api: fakeApi()
    });
    controller.moveIntoFolder("stage", "composition:a", "");
    controller.moveIntoFolder("stage", "composition:b", "");
    controller.moveBeside("stage", "composition:b", "composition:a", false);
    expect(controller.getState().organization.stage.order).toEqual(["composition:b", "composition:a"]);
  });

  it("deleting a folder orphans its items to root and can undo", () => {
    const controller = createArtOrganizationController({
      initialOrganization: emptyOrganization(),
      compositions: comps,
      assets: [],
      api: fakeApi()
    });
    controller.createFolder("stage", "Group");
    const folderId = controller.getState().organization.stage.folders[0].id;
    controller.moveIntoFolder("stage", "composition:a", folderId);
    controller.deleteFolder("stage", folderId);
    expect(controller.getState().organization.stage.folders).toHaveLength(0);
    expect(controller.getState().organization.stage.order).toContain("composition:a");
    controller.undo();
    expect(controller.getState().organization.stage.folders).toHaveLength(1);
  });

  it("saves the cleaned organization and clears dirty", async () => {
    const api = fakeApi();
    const controller = createArtOrganizationController({
      initialOrganization: emptyOrganization(),
      compositions: comps,
      assets: [],
      api
    });
    controller.createFolder("stage", "Group");
    const ok = await controller.save();
    expect(ok).toBe(true);
    expect(api.saveArtOrganization).toHaveBeenCalledTimes(1);
    expect(controller.getState().dirty).toBe(false);
  });
});
