(function () {
  "use strict";

  function createFlowNodePortsFactory(context) {
    function createPort({ label, dotDataset, connection, hint, metaHint }) {
      const port = document.createElement("div");
      port.className = "flow-node-port";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const dot = document.createElement("span");
      dot.className = "flow-node-port-dot";
      Object.entries(dotDataset || {}).forEach(([key, value]) => {
        dot.dataset[key] = value || "";
      });
      dot.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        context.armConnection?.({
          connection: {
            ...(connection || {}),
            pointerId: event.pointerId,
            commandCreate: event.metaKey
          },
          dot,
          hint: event.metaKey && metaHint ? metaHint : hint
        });
      });
      port.append(labelEl, dot);
      return port;
    }

    function createPorts(items) {
      const ports = document.createElement("div");
      ports.className = "flow-node-ports";
      for (const item of items || []) ports.appendChild(createPort(item));
      return ports;
    }

    function createMomentPorts(state) {
      return createPorts([{
        label: `Next Moment${state.nextStateTargetId ? ` -> ${context.flowStateName?.(state.nextStateTargetId) || state.nextStateTargetId}` : ""}`,
        dotDataset: {
          stateId: state.id,
          field: "nextStateTargetId",
          targetKind: "momentGraph"
        },
        connection: {
          sourceKind: "moment",
          stateId: state.id,
          field: "nextStateTargetId",
          targetKind: "momentGraph"
        },
        hint: "Release over a moment-layer node to connect this exit."
      }]);
    }

    function createMomentRoutePorts(routeNode) {
      return createPorts([{
        label: `Target${routeNode.targetStateId ? ` -> ${context.flowStateName?.(routeNode.targetStateId) || routeNode.targetStateId}` : ""}`,
        dotDataset: {
          routeNodeId: routeNode.id,
          field: "targetStateId",
          targetKind: "state"
        },
        connection: {
          sourceKind: "routeNode",
          routeNodeId: routeNode.id,
          field: "targetStateId",
          targetKind: "state"
        },
        hint: "Release over a moment to set this Moment Entry target."
      }]);
    }

    function createActionPorts(action, exits) {
      return createPorts((exits || []).map((exit) => {
        const branch = exit.branch || null;
        const target = branch ? branch.targetActionId : action[exit.field] || "";
        return {
          label: `${exit.label}${target ? ` -> ${context.flowTargetActionName?.(target) || target}` : ""}`,
          dotDataset: {
            actionId: action.id,
            field: exit.field || "",
            branchId: exit.branchId || "",
            targetKind: exit.targetKind || "action"
          },
          connection: {
            stateId: context.selectedFlowStateId?.() || "",
            actionId: action.id,
            field: exit.field || "",
            branchId: exit.branchId || "",
            targetKind: exit.targetKind || "action"
          },
          hint: "Release over a node to connect this exit.",
          metaHint: "Release over a node to connect, or release on empty graph space to add an action."
        };
      }));
    }

    function createStartPorts(state) {
      return createPorts([{
        label: `Entry${state.entryTargetActionId ? ` -> ${context.flowTargetActionName?.(state.entryTargetActionId) || state.entryTargetActionId}` : ""}`,
        dotDataset: {
          stateId: state.id,
          field: "entryTargetActionId",
          targetKind: "action"
        },
        connection: {
          sourceKind: "start",
          stateId: state.id,
          field: "entryTargetActionId",
          targetKind: "action"
        },
        hint: "Release over an action to choose this moment's first action.",
        metaHint: "Release over a node to connect, or release on empty graph space to add an action."
      }]);
    }

    return {
      createActionPorts,
      createMomentRoutePorts,
      createMomentPorts,
      createStartPorts
    };
  }

  window.PartyGameFlowNodePorts = { createFlowNodePortsFactory };
})();
