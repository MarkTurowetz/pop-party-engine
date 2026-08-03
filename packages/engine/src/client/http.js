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
  let mutationRecoveryHandler = null;
  let mutationRecoveryPromise = null;

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
    let authoringSession = "";
    try {
      authoringSession = String(globalThis.sessionStorage?.getItem("pop-party-authoring-session") || "");
    } catch (error) {
      authoringSession = "";
    }
    return {
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(authoringSession ? { "X-Pop-Party-Authoring-Session": authoringSession } : {})
    };
  }

  function isInvalidCsrf(error) {
    return options.adminCsrf
      && error instanceof ApiError
      && error.status === 403
      && String(error.payload?.code || error.payload?.errorCode || "") === "ADMIN_CSRF_INVALID";
  }

  function isStaleAuthoringSession(error, path) {
    return !String(path || "").startsWith("/api/authoring/workspace/")
      && error instanceof ApiError
      && error.status === 409
      && String(error.payload?.code || error.payload?.errorCode || "") === "AUTHORING_SESSION_STALE";
  }

  async function recoverMutation(error, context) {
    if (typeof mutationRecoveryHandler !== "function") return false;
    if (!mutationRecoveryPromise) {
      mutationRecoveryPromise = Promise.resolve()
        .then(() => mutationRecoveryHandler({ ...context, error }))
        .finally(() => {
          mutationRecoveryPromise = null;
        });
    }
    await mutationRecoveryPromise;
    return true;
  }

  async function mutate(path, init) {
    let csrfRetried = false;
    let authoringRetried = false;
    while (true) {
      const response = await fetchImpl(apiUrl(baseUrl, path), {
        ...init,
        headers: {
          ...init.headers,
          ...(await mutationHeaders())
        }
      });
      try {
        return await parseJsonResponse(response);
      } catch (error) {
        if (!csrfRetried && isInvalidCsrf(error)) {
          csrfRetried = true;
          csrfTokenPromise = null;
          continue;
        }
        if (!authoringRetried && isStaleAuthoringSession(error, path)) {
          authoringRetried = true;
          if (await recoverMutation(error, { method: init.method || "POST", path })) continue;
        }
        throw error;
      }
    }
  }

  return Object.freeze({
    async getJson(path) {
      const response = await fetchImpl(apiUrl(baseUrl, path), { headers: { Accept: "application/json" } });
      return parseJsonResponse(response);
    },
    async postJson(path, body) {
      return mutate(path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
    },
    async deleteJson(path) {
      return mutate(path, {
        method: "DELETE",
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
    },
    setMutationRecoveryHandler(handler) {
      mutationRecoveryHandler = typeof handler === "function" ? handler : null;
    }
  });
}

module.exports = Object.freeze({ ApiError, createApiClient });
