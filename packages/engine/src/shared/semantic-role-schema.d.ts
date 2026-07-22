export interface SemanticRoleTarget {
  readonly compositionId: string;
  readonly instancePath?: readonly string[];
}
export interface SemanticRoleDocument {
  readonly schemaVersion: 1;
  readonly roles: Readonly<Record<string, SemanticRoleTarget>>;
}
export interface SemanticRoleDefinition {
  readonly surface: "stage" | "controller";
  readonly terminalKind?: "composition" | "container" | "reference";
  readonly requiredInstanceLabels?: readonly string[];
}
export declare class SemanticRoleValidationError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}
export declare const coreSemanticRoleDefinitions: Readonly<Record<string, SemanticRoleDefinition>>;
export declare const requiredCoreSemanticRoles: readonly string[];
export declare function normalizeSemanticRoleTarget(value: unknown, role?: string): SemanticRoleTarget;
export declare function normalizeSemanticRoleMap(value: unknown, options?: { requireCoreRoles?: boolean }): Readonly<Record<string, SemanticRoleTarget>>;
export declare function validateSemanticRoleDocument(document: unknown, artManifest: unknown): SemanticRoleDocument;
export declare function semanticRoleTargetKey(value: unknown): string;
