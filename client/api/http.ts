export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, { status = 0, payload = null }: { status?: number; payload?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  getJson<T>(path: string): Promise<T>;
  postJson<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse>;
  deleteJson<T>(path: string): Promise<T>;
}

function normalizeBaseUrl(baseUrl = ""): string {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function apiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, { status: response.status, payload });
  }
  return payload as T;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl || fetch;

  return {
    async getJson<T>(path: string): Promise<T> {
      const response = await fetchImpl(apiUrl(baseUrl, path), {
        headers: { Accept: "application/json" }
      });
      return parseJsonResponse<T>(response);
    },

    async postJson<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse> {
      const response = await fetchImpl(apiUrl(baseUrl, path), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      return parseJsonResponse<TResponse>(response);
    },

    async deleteJson<T>(path: string): Promise<T> {
      const response = await fetchImpl(apiUrl(baseUrl, path), {
        method: "DELETE",
        headers: { Accept: "application/json" }
      });
      return parseJsonResponse<T>(response);
    }
  };
}
