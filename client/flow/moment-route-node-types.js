(function () {
  "use strict";

  function isDecision(node) {
    return node?.routeNodeType === "decision" || (node?.routeNodeType === "action" && node?.type === "decision");
  }

  function isAction(node) {
    return node?.routeNodeType === "action";
  }

  function name(node) {
    if (isDecision(node)) return "Decision";
    if (isAction(node)) return "Action";
    return "Moment Entry";
  }

  window.PartyGameFlowMomentRouteNodeTypes = {
    isAction,
    isDecision,
    name
  };
})();
