export interface RuntimeSemanticRoleTarget {
  compositionId: string;
  instancePath?: string[];
}

export type RuntimeSemanticRoleMap = Record<string, RuntimeSemanticRoleTarget>;

declare global {
  var __POP_PARTY_RUNTIME_CONFIG__: { semanticRoles?: RuntimeSemanticRoleMap } | undefined;
}

export class SemanticRoleRuntimeError extends Error {
  code: string;
  role: string;

  constructor(code: string, message: string, role: string) {
    super(message);
    this.name = "SemanticRoleRuntimeError";
    this.code = code;
    this.role = role;
  }
}

function documentRuntimeConfig(documentRef: Document | undefined): { semanticRoles?: RuntimeSemanticRoleMap } | null {
  const node = documentRef?.getElementById("pop-party-runtime-config");
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as { semanticRoles?: RuntimeSemanticRoleMap };
  } catch {
    throw new SemanticRoleRuntimeError("SEMANTIC_ROLE_RUNTIME_CONFIG_INVALID", "Runtime semantic-role configuration is invalid JSON", "");
  }
}

export function runtimeSemanticRoles(
  roles?: RuntimeSemanticRoleMap,
  documentRef: Document | undefined = typeof document !== "undefined" ? document : undefined
): RuntimeSemanticRoleMap {
  const resolved = roles || globalThis.__POP_PARTY_RUNTIME_CONFIG__?.semanticRoles || documentRuntimeConfig(documentRef)?.semanticRoles;
  if (!resolved || typeof resolved !== "object") {
    throw new SemanticRoleRuntimeError("SEMANTIC_ROLE_RUNTIME_CONFIG_MISSING", "Runtime semantic-role configuration is missing", "");
  }
  return resolved;
}

export function runtimeSemanticRoleTarget(
  role: string,
  roles?: RuntimeSemanticRoleMap,
  documentRef?: Document
): RuntimeSemanticRoleTarget {
  const target = runtimeSemanticRoles(roles, documentRef)[role];
  const compositionId = String(target?.compositionId || "").trim();
  if (!compositionId) {
    throw new SemanticRoleRuntimeError("SEMANTIC_ROLE_RUNTIME_TARGET_MISSING", `Required runtime semantic role is missing: ${role}`, role);
  }
  return {
    compositionId,
    ...(Array.isArray(target.instancePath) && target.instancePath.length
      ? { instancePath: target.instancePath.map((segment) => String(segment || "").trim()) }
      : {})
  };
}

export function runtimeSemanticCompositionId(role: string, roles?: RuntimeSemanticRoleMap, documentRef?: Document): string {
  return runtimeSemanticRoleTarget(role, roles, documentRef).compositionId;
}

export function runtimeSemanticInstanceLabel(role: string, roles?: RuntimeSemanticRoleMap, documentRef?: Document): string {
  const target = runtimeSemanticRoleTarget(role, roles, documentRef);
  const label = target.instancePath?.at(-1) || "";
  if (!label) {
    throw new SemanticRoleRuntimeError("SEMANTIC_ROLE_RUNTIME_PATH_MISSING", `Runtime semantic role does not identify an authored instance: ${role}`, role);
  }
  return label;
}
