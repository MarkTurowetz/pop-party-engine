export const ADMIN_API_PATHS: readonly string[];
export const TOOL_PATHS: readonly string[];
export function cookieMap(header: unknown): Map<string, string>;
export function createAdminAuthRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function isLoopback(address: unknown): boolean;
export function safeReturnTo(value: unknown): string;
