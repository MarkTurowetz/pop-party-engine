"use strict";

function createActionCompletionBarrier() {
  let pending = 0;
  let sealed = false;
  let resolved = false;
  let resolvePromise = () => {};
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  const finishIfReady = () => {
    if (resolved || !sealed || pending > 0) return;
    resolved = true;
    resolvePromise();
  };
  return Object.freeze({
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
  });
}

function resolvedActionCompletion() {
  return Promise.resolve();
}

module.exports = Object.freeze({ createActionCompletionBarrier, resolvedActionCompletion });
