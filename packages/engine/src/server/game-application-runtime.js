"use strict";

const { createGameServiceRuntime } = require("./game-service-runtime");

const JSON_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function sendJson(response, status, payload, method = "GET") {
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  response.writeHead(status, { ...JSON_HEADERS, "Content-Length": bytes.length });
  response.end(method === "HEAD" ? undefined : bytes);
}

function publicRuntimeMetadata(gameDefinition, active) {
  return Object.freeze({
    game: Object.freeze({
      id: gameDefinition.gameId,
      displayName: gameDefinition.displayName,
      version: gameDefinition.version,
      pluginNamespace: gameDefinition.plugin.namespace
    }),
    release: Object.freeze({ ...active.release })
  });
}

function bootstrapRenderer(gameDefinition, role) {
  const registrationKind = role === "stage" ? "stageRenderers" : "controllerRenderers";
  const registrations = gameDefinition.registrations?.[registrationKind] || [];
  if (registrations.length !== 1) {
    throw new Error(`Game application requires exactly one ${role} bootstrap renderer; found ${registrations.length}`);
  }
  const registration = registrations[0];
  if (typeof registration.value?.renderBootstrap !== "function") {
    throw new Error(`Game application ${role} renderer ${registration.id} must implement renderBootstrap`);
  }
  return registration;
}

function bootstrapView(registration, metadata, role) {
  const view = registration.value.renderBootstrap(Object.freeze({
    game: metadata.game,
    release: metadata.release,
    role
  }));
  if (!view || typeof view !== "object" || !String(view.heading || "").trim() || !String(view.message || "").trim()) {
    throw new Error(`Game application ${role} renderer ${registration.id} returned an invalid bootstrap view`);
  }
  return Object.freeze({ heading: String(view.heading), message: String(view.message) });
}

function bootstrapHtml(role, metadata, view) {
  const title = `${metadata.game.displayName} — ${role === "stage" ? "Stage" : "Controller"}`;
  const runtimeJson = JSON.stringify(metadata).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main data-pop-party-role="${role}" data-content-revision="${escapeHtml(metadata.release.contentRevision)}">
    <h1>${escapeHtml(view.heading)}</h1>
    <p>${escapeHtml(view.message)}</p>
  </main>
  <script id="pop-party-runtime-config" type="application/json">${runtimeJson}</script>
</body>
</html>`;
}

function createGameApplicationRequestHandler(options = {}) {
  const gameDefinition = options.gameDefinition;
  const active = options.active;
  if (!gameDefinition || !active?.release) {
    throw new Error("Game application request handler requires a validated active release");
  }
  const metadata = publicRuntimeMetadata(gameDefinition, active);
  const renderers = Object.freeze({
    controller: bootstrapRenderer(gameDefinition, "controller"),
    stage: bootstrapRenderer(gameDefinition, "stage")
  });
  const views = Object.freeze({
    controller: bootstrapView(renderers.controller, metadata, "controller"),
    stage: bootstrapView(renderers.stage, metadata, "stage")
  });

  return function gameApplicationRequestHandler(request, response) {
    const method = String(request.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      sendJson(response, 405, { ok: false, diagnostic: { code: "METHOD_NOT_ALLOWED", message: "Only GET and HEAD are supported" } }, method);
      return;
    }
    const url = new URL(request.url || "/", "http://pop-party.invalid");
    if (url.pathname === "/") {
      response.writeHead(302, { "Cache-Control": "no-store", Location: "/stage" });
      response.end();
      return;
    }
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true, status: "ready", ...metadata }, method);
      return;
    }
    if (url.pathname === "/api/runtime") {
      sendJson(response, 200, metadata, method);
      return;
    }
    if (url.pathname === "/stage" || url.pathname === "/controller") {
      const role = url.pathname.slice(1);
      const bytes = Buffer.from(bootstrapHtml(role, metadata, views[role]), "utf8");
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": bytes.length,
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(method === "HEAD" ? undefined : bytes);
      return;
    }
    if (url.pathname === "/tools" || url.pathname.startsWith("/tools/")) {
      sendJson(response, 503, {
        ok: false,
        diagnostic: {
          code: "GAME_TOOLING_NOT_CONFIGURED",
          message: "This game has not registered an authenticated tooling application"
        }
      }, method);
      return;
    }
    sendJson(response, 404, { ok: false, diagnostic: { code: "ROUTE_NOT_FOUND", message: "Route not found" } }, method);
  };
}

function createGameApplicationRuntime(options = {}) {
  const gameDefinition = options.gameDefinition;
  if (!gameDefinition) throw new Error("Game application requires a defined game");
  return createGameServiceRuntime({
    ...options,
    gameDefinition,
    createRequestHandler(active) {
      return createGameApplicationRequestHandler({ active, gameDefinition });
    }
  });
}

module.exports = Object.freeze({
  createGameApplicationRequestHandler,
  createGameApplicationRuntime,
  publicRuntimeMetadata
});
