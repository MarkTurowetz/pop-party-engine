import type { ContentMigrationPreview } from "../server/content-migration-runtime";
import type { ContentSnapshot } from "../../index";

export function assertOutputRoot(cwd: string, outputDirectory: string): string;
export function writeContentSnapshot(snapshot: ContentSnapshot, options: Record<string, unknown>): string;
export function createGameMigration(options: Record<string, unknown>): Promise<Readonly<{
  outputRoot: string | null;
  preview: ContentMigrationPreview;
} & Record<string, unknown>>>;
