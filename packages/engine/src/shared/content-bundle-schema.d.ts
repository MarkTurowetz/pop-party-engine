export interface BundleFileRecord {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ContentBundleManifest {
  schemaVersion: number;
  gameId: string;
  engineContentSchemaVersion: string;
  flowExpressionLanguageVersion: number;
  gameMigrationLevel: number;
  semanticRolesPath: string;
  parentRevision: string;
  publishedRevision: string;
  files: readonly BundleFileRecord[];
  rootHash: string;
}

export const CONTENT_BUNDLE_MANIFEST_PATH: string;
export const CONTENT_BUNDLE_SCHEMA_VERSION: number;
export const REQUIRED_CONTENT_PATHS: readonly string[];
export function canonicalizeJson(value: unknown): string;
export function normalizeBundlePath(value: unknown): string;
export function normalizeManifest(value: unknown): Readonly<ContentBundleManifest>;
export function rootHashInput(files: readonly BundleFileRecord[]): string;
