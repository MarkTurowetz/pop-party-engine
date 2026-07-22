export interface ActionCompletionBarrier {
  addTarget: () => () => void;
  seal: () => void;
  promise: Promise<void>;
}
export function createActionCompletionBarrier(): ActionCompletionBarrier;
export function resolvedActionCompletion(): Promise<void>;
