export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(message: string, options?: { status?: number; payload?: unknown });
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  adminCsrf?: boolean;
}

export interface ApiClient {
  getJson<T>(path: string): Promise<T>;
  postJson<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse>;
  deleteJson<T>(path: string): Promise<T>;
}

export function createApiClient(options?: ApiClientOptions): ApiClient;
