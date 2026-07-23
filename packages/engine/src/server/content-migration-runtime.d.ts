import type { ContentSnapshot } from "../../index";

export class ContentMigrationError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface ContentMigrationPreview {
  readonly changedPaths: readonly string[];
  readonly snapshot: ContentSnapshot;
  readonly sourceLevel: number;
  readonly sourceRevision: string;
  readonly steps: readonly Readonly<Record<string, unknown>>[];
  readonly targetLevel: number;
  readonly targetRevision: string;
}

export function normalizeMigrationRegistration(registration: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function applyMigration(migration: Record<string, unknown>, snapshot: ContentSnapshot): Promise<ContentSnapshot>;
export function createContentMigrationRuntime(options: Record<string, unknown>): Readonly<{
  latestLevel: number;
  migrations: readonly Readonly<Record<string, unknown>>[];
  preview(input: { snapshot: ContentSnapshot; targetLevel?: number }): Promise<ContentMigrationPreview>;
}>;
