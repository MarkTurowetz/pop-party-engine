function createFlowTargetRuntime({ normalizeFlowId }) {
  function isNoActionTarget(value) {
    return String(value || "").toLowerCase() === "none";
  }

  function isReturnActionTarget(value) {
    return String(value || "").toLowerCase() === "return";
  }

  function flowActionTarget(action) {
    const target = normalizeFlowId(action, "");
    if (isNoActionTarget(target)) return "none";
    if (isReturnActionTarget(target)) return "return";
    return target || "";
  }

  return {
    flowActionTarget,
    isNoActionTarget,
    isReturnActionTarget
  };
}

module.exports = { createFlowTargetRuntime };
