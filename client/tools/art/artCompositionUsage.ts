import type { ArtComponent, ArtComposition, ArtCompositionDependencyDetail, ArtCompositionDependencySummary } from "../../types/game-data";

function countComponentReferences(components: ArtComponent[], counts: Map<string, number>): void {
  for (const component of components || []) {
    if (component.kind === "reference" && component.artCompositionId) {
      const compositionId = String(component.artCompositionId);
      counts.set(compositionId, (counts.get(compositionId) || 0) + 1);
    }
    countComponentReferences(component.children || [], counts);
  }
}

/** Counts direct reference instances across every provided Art Manager document. */
export function artCompositionReferenceCounts(documents: ArtComposition[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const document of documents || []) countComponentReferences(document.components || [], counts);
  return counts;
}

export function artCompositionUsageLabel(count: number): string {
  return `${count} ${count === 1 ? "use" : "uses"}`;
}

export interface ArtCompositionCleanupSummary {
  total: number;
  artReferences: number;
  stageLayoutReferences: number;
  controllerLayoutReferences: number;
  flowReferences: number;
  runtimeReferences: number;
  details: ArtCompositionDependencyDetail[];
}

function localArtReferenceDetails(documents: ArtComposition[], targetId: string, ignoredSourceIds: Set<string>): ArtCompositionDependencyDetail[] {
  const details: ArtCompositionDependencyDetail[] = [];
  const visit = (components: ArtComponent[], source: ArtComposition, path: string[] = []): void => {
    for (const component of components || []) {
      const nextPath = [...path, String(component.instanceLabel || component.name || component.id || "")].filter(Boolean);
      if (component.kind === "reference" && component.artCompositionId === targetId && !ignoredSourceIds.has(source.id)) {
        details.push({
          kind: "art",
          sourceCompositionId: source.id,
          sourceName: source.name,
          sourcePath: nextPath.join(" / ")
        });
      }
      visit(component.children || [], source, nextPath);
    }
  };
  for (const document of documents) visit(document.components || [], document);
  return details;
}

export function artCompositionCleanupSummary(
  compositionId: string,
  documents: ArtComposition[],
  serverSummary: ArtCompositionDependencySummary | undefined,
  trashedCompositionIds: Set<string> = new Set()
): ArtCompositionCleanupSummary {
  const artDetails = localArtReferenceDetails(documents, compositionId, trashedCompositionIds);
  const externalDetails = (serverSummary?.details || []).filter((detail) => detail.kind !== "art");
  const details = [...artDetails, ...externalDetails];
  const count = (kind: ArtCompositionDependencyDetail["kind"]) => details.filter((detail) => detail.kind === kind).length;
  return {
    total: details.length,
    artReferences: count("art"),
    stageLayoutReferences: count("stageLayout"),
    controllerLayoutReferences: count("controllerLayout"),
    flowReferences: count("flow"),
    runtimeReferences: count("runtime"),
    details
  };
}

export function artCompositionDependencyLabel(summary: ArtCompositionCleanupSummary): string {
  return summary.total === 0 ? "Unused" : `${summary.total} ${summary.total === 1 ? "reference" : "references"}`;
}
