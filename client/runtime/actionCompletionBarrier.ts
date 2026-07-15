export interface ActionCompletionBarrier {
  addTarget: () => () => void;
  seal: () => void;
  promise: Promise<void>;
}

export function createActionCompletionBarrier(): ActionCompletionBarrier {
  let pending = 0;
  let sealed = false;
  let resolved = false;
  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const finishIfReady = () => {
    if (resolved || !sealed || pending > 0) return;
    resolved = true;
    resolvePromise();
  };

  return {
    addTarget() {
      if (sealed) throw new Error("Cannot add a target after sealing an action completion barrier");
      pending += 1;
      let completed = false;
      return () => {
        if (completed) return;
        completed = true;
        pending = Math.max(0, pending - 1);
        finishIfReady();
      };
    },
    seal() {
      sealed = true;
      finishIfReady();
    },
    promise
  };
}

export function resolvedActionCompletion(): Promise<void> {
  return Promise.resolve();
}
