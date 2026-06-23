(function () {
  "use strict";

  function createFlowNodeBranchDescriptors(context) {
    function branchTargetField(options = {}) {
      return options.targetField || "targetActionId";
    }

    function branchSourceKind(options = {}) {
      return options.sourceKind === "routeNode" ? "routeNode" : "action";
    }

    function branchTargetKind(options = {}) {
      if (options.targetKind) return options.targetKind;
      return branchSourceKind(options) === "routeNode" ? "momentGraph" : "action";
    }

    function ensureBranches(action, options = {}) {
      return context.ensureDecisionBranches?.(action, { targetField: branchTargetField(options) }) || [];
    }

    function targetNameFor(options = {}) {
      if (typeof options.targetName === "function") return options.targetName;
      return context.flowTargetActionName || ((targetId) => targetId || "No Connection");
    }

    function connectionFor(state, action, branch, options = {}) {
      const targetField = branchTargetField(options);
      const sourceKind = branchSourceKind(options);
      if (sourceKind === "routeNode") {
        return {
          sourceKind,
          routeNodeId: action.id,
          field: targetField,
          branchId: branch.id,
          targetKind: branchTargetKind(options)
        };
      }
      return {
        sourceKind,
        stateId: state?.id || "",
        actionId: action.id,
        field: targetField,
        branchId: branch.id,
        targetKind: branchTargetKind(options)
      };
    }

    function descriptorFor(state, action, branch, index, options = {}) {
      const targetField = branchTargetField(options);
      const targetName = targetNameFor(options);
      const targetId = branch?.[targetField] || "";
      const connection = connectionFor(state, action, branch, options);
      return {
        branch,
        connection,
        index,
        label: context.decisionBranchName?.(branch, index) || "Branch",
        sortOptions: { targetField },
        targetField,
        targetId,
        targetLabel: targetId ? `-> ${targetName(targetId) || targetId}` : "No Connection",
        targetKind: connection.targetKind
      };
    }

    function descriptorsFor(state, action, options = {}) {
      return ensureBranches(action, options).map((branch, index) => descriptorFor(state, action, branch, index, options));
    }

    return {
      branchTargetField,
      branchTargetKind,
      branchSourceKind,
      connectionFor,
      descriptorsFor,
      ensureBranches
    };
  }

  window.PartyGameFlowNodeBranchDescriptors = { createFlowNodeBranchDescriptors };
})();
