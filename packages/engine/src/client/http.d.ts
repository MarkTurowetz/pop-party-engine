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
  setMutationRecoveryHandler(handler: null | ((context: {
    error: unknown;
    method: string;
    path: string;
  }) => Promise<void> | void)): void;
}

export function createApiClient(options?: ApiClientOptions): ApiClient;
