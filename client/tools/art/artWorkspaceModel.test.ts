import { describe, expect, it } from "vitest";
import {
  ART_WORKSPACE_STORAGE_KEY,
  artWorkspaceId,
  createArtWorkspace,
  readArtWorkspaces,
  writeArtWorkspaces,
  type ArtWorkspaceStorage
} from "./artWorkspaceModel";

function memoryStorage(): ArtWorkspaceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => { values.set(key, value); }
  };
}

describe("Art Manager workspaces", () => {
  it("creates blank reserved Stage documents without lifecycle animations", () => {
    const stage = createArtWorkspace("stage");

    expect(stage).toMatchObject({ id: artWorkspaceId("stage"), name: "Stage", surface: "stage", components: [] });
    expect(stage.timeline).toEqual({ fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] });
  });

  it("persists each surface independently and repairs reserved identity fields", () => {
    const storage = memoryStorage();
    const workspaces = readArtWorkspaces(storage);
    workspaces.stage.components = [{ id: "shape", name: "Shape", kind: "shape", x: 10, y: 20 }] as never;
    workspaces.controller.components = [{ id: "button", name: "Button", kind: "shape" }] as never;
    writeArtWorkspaces(storage, workspaces);

    const saved = JSON.parse(storage.values.get(ART_WORKSPACE_STORAGE_KEY) || "{}");
    saved.stage.id = "not-stage";
    saved.stage.name = "Untitled Prefab";
    storage.setItem(ART_WORKSPACE_STORAGE_KEY, JSON.stringify(saved));
    const reloaded = readArtWorkspaces(storage);

    expect(reloaded.stage).toMatchObject({ id: artWorkspaceId("stage"), name: "Stage" });
    expect(reloaded.stage.components[0].id).toBe("shape");
    expect(reloaded.controller.components[0].id).toBe("button");
  });
});
