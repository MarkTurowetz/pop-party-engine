export function canvasDragSelection(
  currentSelection: ReadonlySet<string>,
  anchorId: string,
  additive: boolean
): Set<string> {
  if (currentSelection.has(anchorId)) return new Set(currentSelection);
  return additive ? new Set([...currentSelection, anchorId]) : new Set([anchorId]);
}
