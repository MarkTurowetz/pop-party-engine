export function loadGameDefinition(options?: {
  cwd?: string;
  configPath?: string;
  environment?: { POP_PARTY_CONTENT_ROOT?: string };
}): Readonly<{ cwd: string; configPath: string; gameDefinition: Record<string, unknown> }>;

export function createGameBuild(options: {
  cwd?: string;
  configPath?: string;
  outputDirectory?: string;
  engineVersion: string;
  contentSchemaVersion?: string;
}): Promise<Readonly<Record<string, unknown>>>;
