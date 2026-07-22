"use strict";

class ApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizeBaseUrl(baseUrl = "") {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function apiUrl(baseUrl, path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, { status: response.status, payload });
  }
  return payload;
}

function createApiClient(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl || fetch;
  let csrfTokenPromise = null;

  async function adminCsrfToken() {
    if (!options.adminCsrf) return "";
    if (!csrfTokenPromise) {
      csrfTokenPromise = fetchImpl(apiUrl(baseUrl, "/api/admin/session"), {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      }).then(async (response) => {
        const payload = await parseJsonResponse(response);
        return String(payload.csrfToken || "");
      });
    }
    return csrfTokenPromise;
  }

  async function mutationHeaders() {
    const csrfToken = await adminCsrfToken();
    return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  }

  return Object.freeze({
    async getJson(path) {
      const response = await fetchImpl(apiUrl(baseUrl, path), { headers: { Accept: "application/json" } });
      return parseJsonResponse(response);
    },
    async postJson(path, body) {
      const response = await fetchImpl(apiUrl(baseUrl, path), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(await mutationHeaders())
        },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
      return parseJsonResponse(response);
    },
    async deleteJson(path) {
      const response = await fetchImpl(apiUrl(baseUrl, path), {
        method: "DELETE",
        headers: { Accept: "application/json", ...(await mutationHeaders()) },
        credentials: "same-origin"
      });
      return parseJsonResponse(response);
    }
  });
}

module.exports = Object.freeze({ ApiError, createApiClient });
