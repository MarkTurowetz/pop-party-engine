export interface RevisionedToolAuthoringRuntime {
  initialize(): Promise<Record<string, unknown>>;
  readDraft(options?: { refresh?: boolean }): Promise<Record<string, unknown>>;
  readJson(logicalPath: string, options?: { refresh?: boolean }): Promise<{ revision: string; value: unknown }>;
  status(): Readonly<Record<string, unknown>>;
  writeFiles(replacements: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<Record<string, unknown>>;
  writeJson(logicalPath: string, value: unknown, metadata?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createRevisionedToolAuthoringRuntime(options: {
  contentStore: Record<string, unknown>;
  scope?: string;
}): RevisionedToolAuthoringRuntime;
export function idempotencyKey(value: unknown, prefix?: string): string;
