export function resolveDevelopmentContentRoot(cwd: string, relativeRoot?: string): string;
export function prepareDevelopmentWorkspace(options?: Record<string, unknown>): Promise<Readonly<{
  contentRoot: string;
  loaded: Readonly<Record<string, unknown>>;
  revision: string;
  seeded: boolean;
}>>;
