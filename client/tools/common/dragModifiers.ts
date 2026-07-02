export type DragMovementAxis = "x" | "y";

export interface DragModifierState {
  movementAxis: DragMovementAxis | null;
}

export interface DragModifierInput {
  originX: number;
  originY: number;
  deltaX: number;
  deltaY: number;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  axisThreshold?: number;
}

export interface DragModifierResult {
  x: number;
  y: number;
  movementAxis: DragMovementAxis | null;
}

export function createDragModifierState(): DragModifierState {
  return { movementAxis: null };
}

export function applyDragModifiers(input: DragModifierInput, state: DragModifierState): DragModifierResult {
  const axisThreshold = Math.max(0, Number(input.axisThreshold ?? 2));
  const shiftKey = input.shiftKey === true;
  const snapToInteger = input.metaKey === true || input.ctrlKey === true;
  let movementAxis = state.movementAxis;
  const absX = Math.abs(input.deltaX);
  const absY = Math.abs(input.deltaY);

  if (!movementAxis && shiftKey && Math.max(absX, absY) >= axisThreshold) {
    movementAxis = absX >= absY ? "x" : "y";
    state.movementAxis = movementAxis;
  }

  let x = input.originX + input.deltaX;
  let y = input.originY + input.deltaY;

  if (shiftKey && movementAxis === "x") y = input.originY;
  if (shiftKey && movementAxis === "y") x = input.originX;
  if (snapToInteger) {
    x = Math.round(x);
    y = Math.round(y);
  }

  return { x, y, movementAxis };
}
