import type { ContentStore } from "../../index";

export class ContentStoreConflictError extends Error {
  readonly code: string;
  readonly status: number;
  readonly expectedRevision: string;
  readonly actualRevision: string;
}

export function createReleaseRecord(input: Record<string, unknown>, previousRevision?: string): Readonly<Record<string, unknown>>;
export function createRevisionedContentStoreRuntime(options?: Record<string, unknown>): ContentStore & Readonly<Record<string, unknown>>;
export function normalizeScope(value: unknown): string;
export function requiredIdempotencyKey(value: unknown): string;
export function stableHash(value: unknown): string;
