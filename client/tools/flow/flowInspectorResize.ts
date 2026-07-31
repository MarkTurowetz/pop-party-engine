export const flowInspectorStorageKey = "partyTemplate.flowInspectorWidth";
export const defaultFlowInspectorWidth = 420;
export const minimumFlowInspectorWidth = 320;
export const maximumFlowInspectorWidth = 900;
export const minimumFlowCanvasWidth = 320;
export const flowInspectorResizeStep = 24;
const flowInspectorDividerAndGapsWidth = 36;

export function clampFlowInspectorWidth(
  value: number,
  workspaceWidth?: number
): number {
  const availableMaximum = Number.isFinite(workspaceWidth)
    ? Math.max(
        minimumFlowInspectorWidth,
        Math.min(
          maximumFlowInspectorWidth,
          Number(workspaceWidth) - minimumFlowCanvasWidth - flowInspectorDividerAndGapsWidth
        )
      )
    : maximumFlowInspectorWidth;
  const finiteValue = Number.isFinite(value) ? value : defaultFlowInspectorWidth;
  return Math.round(Math.max(
    minimumFlowInspectorWidth,
    Math.min(availableMaximum, finiteValue)
  ));
}

export function readStoredFlowInspectorWidth(storage?: Storage | null): number {
  if (!storage) return defaultFlowInspectorWidth;
  try {
    const stored = storage.getItem(flowInspectorStorageKey);
    if (stored === null || stored === "") return defaultFlowInspectorWidth;
    return clampFlowInspectorWidth(Number(stored));
  } catch {
    return defaultFlowInspectorWidth;
  }
}

export function storeFlowInspectorWidth(width: number, storage?: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(flowInspectorStorageKey, String(clampFlowInspectorWidth(width)));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}
