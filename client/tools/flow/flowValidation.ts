export interface FlowValidationIssue {
  path: string;
  message: string;
}

export class FlowValidationError extends Error {
  readonly issues: FlowValidationIssue[];

  constructor(issues: FlowValidationIssue[]) {
    super(issues[0] ? `${issues[0].path} ${issues[0].message}` : "Flow validation failed");
    this.name = "FlowValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(issues: FlowValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateFlowActionList(
  value: unknown,
  path: string,
  issues: FlowValidationIssue[],
  actionIds: Map<string, string>,
  trackIdentity = true
): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, path, "must be an array");
    return;
  }

  value.forEach((action, actionIndex) => {
    const actionPath = `${path}[${actionIndex}]`;
    if (!isRecord(action)) {
      pushIssue(issues, actionPath, "must be an object");
      return;
    }
    if (typeof action.id !== "string") {
      pushIssue(issues, `${actionPath}.id`, "must be a string");
    } else if (trackIdentity) {
      const previousPath = actionIds.get(action.id);
      if (previousPath) {
        pushIssue(issues, `${actionPath}.id`, `duplicates ${previousPath}`);
      } else {
        actionIds.set(action.id, `${actionPath}.id`);
      }
    }
    if (action.actions !== undefined)
      validateFlowActionList(action.actions, `${actionPath}.actions`, issues, actionIds);
    if (action.subActions !== undefined)
      validateFlowActionList(action.subActions, `${actionPath}.subActions`, issues, actionIds);
    if (action.branches !== undefined)
      validateFlowActionList(action.branches, `${actionPath}.branches`, issues, actionIds, false);
  });
}

export function collectFlowValidationIssues(value: unknown, label = "flow"): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const stateIds = new Map<string, string>();
  const actionIds = new Map<string, string>();
  const routeNodeIds = new Map<string, string>();
  if (!isRecord(value)) {
    pushIssue(issues, label, "must be an object");
    return issues;
  }

  if (!Array.isArray(value.states)) {
    pushIssue(issues, `${label}.states`, "must be an array");
  } else {
    value.states.forEach((state, stateIndex) => {
      const statePath = `${label}.states[${stateIndex}]`;
      if (!isRecord(state)) {
        pushIssue(issues, statePath, "must be an object");
        return;
      }
      if (typeof state.id !== "string") {
        pushIssue(issues, `${statePath}.id`, "must be a string");
      } else {
        const previousPath = stateIds.get(state.id);
        if (previousPath) pushIssue(issues, `${statePath}.id`, `duplicates ${previousPath}`);
        else stateIds.set(state.id, `${statePath}.id`);
      }
      validateFlowActionList(state.actions, `${statePath}.actions`, issues, actionIds);
    });
  }

  if (value.routeNodes !== undefined && !Array.isArray(value.routeNodes)) {
    pushIssue(issues, `${label}.routeNodes`, "must be an array when present");
  } else if (Array.isArray(value.routeNodes)) {
    value.routeNodes.forEach((node, nodeIndex) => {
      const nodePath = `${label}.routeNodes[${nodeIndex}]`;
      if (!isRecord(node)) {
        pushIssue(issues, nodePath, "must be an object");
        return;
      }
      if (typeof node.id !== "string") {
        pushIssue(issues, `${nodePath}.id`, "must be a string");
        return;
      }
      const previousPath = routeNodeIds.get(node.id);
      if (previousPath) pushIssue(issues, `${nodePath}.id`, `duplicates ${previousPath}`);
      else routeNodeIds.set(node.id, `${nodePath}.id`);
    });
  }

  return issues;
}

export function assertFlowModel(value: unknown, label = "flow"): void {
  const issues = collectFlowValidationIssues(value, label);
  if (issues.length) throw new FlowValidationError(issues);
}

export function isFlowModel(value: unknown): boolean {
  return collectFlowValidationIssues(value).length === 0;
}
