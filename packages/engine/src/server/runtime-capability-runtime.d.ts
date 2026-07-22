export const PLAYER_ENDPOINTS: readonly string[];
export const STAGE_ENDPOINTS: readonly string[];
export function createRuntimeCapabilityRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function secureHashMatches(expected: unknown, actual: unknown): boolean;
export function tokenHash(value: unknown): string;
