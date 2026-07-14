import type { ArtComposition } from "../../types/game-data";
import { hydrateArtCompositionForEditing, normalizeArtCompositionSurface } from "./artCompositionModel";

export type ArtWorkspaceSurface = "stage" | "controller";

export const ART_WORKSPACE_STORAGE_KEY = "partyTemplate.artWorkspaces.v1";
export const ART_WORKSPACE_IDS: Record<ArtWorkspaceSurface, string> = {
  stage: "art-workspace-stage",
  controller: "art-workspace-controller"
};

export interface ArtWorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function artWorkspaceSurface(value: unknown): ArtWorkspaceSurface {
  return normalizeArtCompositionSurface(value) === "controller" ? "controller" : "stage";
}

export function artWorkspaceId(surface: unknown): string {
  return ART_WORKSPACE_IDS[artWorkspaceSurface(surface)];
}

export function isArtWorkspaceId(id: unknown): boolean {
  return Object.values(ART_WORKSPACE_IDS).includes(String(id || ""));
}

export function createArtWorkspace(surface: ArtWorkspaceSurface): ArtComposition {
  return {
    id: artWorkspaceId(surface),
    name: surface === "controller" ? "Controller Stage" : "Stage",
    description: "Persistent Art Manager assembly workspace.",
    surface,
    compositionKind: "prefab",
    isCustom: true,
    isArtWorkspace: true,
    canvas: { width: 560, height: 230 },
    timeline: { fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] },
    components: []
  };
}

function hydrateWorkspace(value: unknown, surface: ArtWorkspaceSurface): ArtComposition {
  const source = value && typeof value === "object" ? value as Partial<ArtComposition> : {};
  const hydrated = hydrateArtCompositionForEditing({
    ...createArtWorkspace(surface),
    ...source,
    id: artWorkspaceId(surface),
    name: surface === "controller" ? "Controller Stage" : "Stage",
    surface,
    isArtWorkspace: true
  } as ArtComposition);
  return {
    ...hydrated,
    id: artWorkspaceId(surface),
    name: surface === "controller" ? "Controller Stage" : "Stage",
    surface,
    isArtWorkspace: true,
    timeline: source.timeline || { fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] }
  };
}

export function readArtWorkspaces(storage?: ArtWorkspaceStorage | null): Record<ArtWorkspaceSurface, ArtComposition> {
  if (!storage) return { stage: createArtWorkspace("stage"), controller: createArtWorkspace("controller") };
  try {
    const parsed = JSON.parse(storage.getItem(ART_WORKSPACE_STORAGE_KEY) || "{}") as Partial<Record<ArtWorkspaceSurface, ArtComposition>>;
    return {
      stage: hydrateWorkspace(parsed.stage, "stage"),
      controller: hydrateWorkspace(parsed.controller, "controller")
    };
  } catch (_error) {
    return { stage: createArtWorkspace("stage"), controller: createArtWorkspace("controller") };
  }
}

export function writeArtWorkspaces(
  storage: ArtWorkspaceStorage | null | undefined,
  workspaces: Record<ArtWorkspaceSurface, ArtComposition>
): void {
  if (!storage) return;
  storage.setItem(ART_WORKSPACE_STORAGE_KEY, JSON.stringify(workspaces));
}
