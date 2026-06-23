(function () {
  "use strict";

  const schemas = {
    actions: {
      id: "actions",
      branchSourceKind: "action",
      branchTargetField: "targetActionId",
      branchTargetKind: "action"
    },
    moments: {
      id: "moments",
      branchSourceKind: "routeNode",
      branchTargetField: "targetNodeId",
      branchTargetKind: "momentGraph"
    }
  };

  function forDepth(depth) {
    return depth === "moments" ? schemas.moments : schemas.actions;
  }

  function forSourceKind(sourceKind) {
    return sourceKind === "routeNode" ? schemas.moments : schemas.actions;
  }

  function branchOptions(options = {}) {
    const schema = options.schema || (options.depth ? forDepth(options.depth) : forSourceKind(options.sourceKind));
    return {
      ...schema,
      sourceKind: options.sourceKind || schema.branchSourceKind,
      targetField: options.targetField || schema.branchTargetField,
      targetKind: options.targetKind || schema.branchTargetKind,
      targetName: options.targetName || null
    };
  }

  window.PartyGameFlowNodeGraphSchema = {
    actions: schemas.actions,
    moments: schemas.moments,
    branchOptions,
    forDepth,
    forSourceKind
  };
})();
