import type { ArtComponent, ArtComposition } from "../../types/game-data";

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
