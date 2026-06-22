(function () {
  "use strict";

  function createHistory({ snapshot, restore, limit = 30 } = {}) {
    if (typeof snapshot !== "function") throw new Error("Tool history requires a snapshot function");
    if (typeof restore !== "function") throw new Error("Tool history requires a restore function");
    const maxEntries = Math.max(1, Math.floor(Number(limit) || 30));
    let undoStack = [];
    let redoStack = [];

    function currentSnapshot() {
      return String(snapshot());
    }

    function trimUndoStack() {
      while (undoStack.length > maxEntries) undoStack.shift();
    }

    function push() {
      const nextSnapshot = currentSnapshot();
      if (undoStack[undoStack.length - 1] === nextSnapshot) return false;
      undoStack.push(nextSnapshot);
      trimUndoStack();
      redoStack = [];
      return true;
    }

    function undo() {
      if (!undoStack.length) return false;
      redoStack.push(currentSnapshot());
      restore(undoStack.pop());
      return true;
    }

    function redo() {
      if (!redoStack.length) return false;
      undoStack.push(currentSnapshot());
      trimUndoStack();
      restore(redoStack.pop());
      return true;
    }

    function clear() {
      undoStack = [];
      redoStack = [];
    }

    function canUndo() {
      return undoStack.length > 0;
    }

    function canRedo() {
      return redoStack.length > 0;
    }

    return {
      canRedo,
      canUndo,
      clear,
      push,
      redo,
      undo
    };
  }

  window.PartyGameToolHistory = { createHistory };
})();
