import type { ContentStore } from "../../index";

export function createContentStoreEnvironmentRuntime(options?: Record<string, unknown>): Readonly<{
  enabled: boolean;
  reason: string;
  store: ContentStore | null;
}>;
