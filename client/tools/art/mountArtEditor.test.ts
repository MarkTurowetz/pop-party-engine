import { describe, expect, it, vi } from "vitest";
import { saveMountedArtEditor, type MountedArtEditor } from "./mountArtEditor";

function editorWithSaveResults(results: { assets?: boolean; compositions?: boolean; organization?: boolean }) {
  const controller = (result = true) => ({
    getState: () => ({ dirty: true }),
    save: vi.fn(async () => result)
  });
  const assetsController = controller(results.assets);
  const compositionsController = controller(results.compositions);
  const organizationController = controller(results.organization);
  return {
    editor: { assetsController, compositionsController, organizationController } as unknown as MountedArtEditor,
    assetsController,
    compositionsController,
    organizationController
  };
}

describe("saveMountedArtEditor", () => {
  it("saves dirty Art Manager stores in manifest-safe sequence", async () => {
    const harness = editorWithSaveResults({ assets: true, compositions: true, organization: true });

    expect(await saveMountedArtEditor(harness.editor)).toBe(true);
    expect(harness.assetsController.save).toHaveBeenCalledTimes(1);
    expect(harness.compositionsController.save).toHaveBeenCalledTimes(1);
    expect(harness.organizationController.save).toHaveBeenCalledTimes(1);
  });

  it("stops at the first rejected store instead of claiming Save All succeeded", async () => {
    const harness = editorWithSaveResults({ assets: true, compositions: false, organization: true });

    expect(await saveMountedArtEditor(harness.editor)).toBe(false);
    expect(harness.assetsController.save).toHaveBeenCalledTimes(1);
    expect(harness.compositionsController.save).toHaveBeenCalledTimes(1);
    expect(harness.organizationController.save).not.toHaveBeenCalled();
  });
});
