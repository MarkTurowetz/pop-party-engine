"use strict";

const fs = require("fs");
const path = require("path");

// The server only serves the Vite shell now; this marker in index.html is where the built
// role entry is injected (it boots app-shell + shared globals via bootLegacySurface).
const LEGACY_SCRIPT_BLOCK_PATTERN = /  <!-- runtime-entry:[^>]*-->/;
const LEGACY_STYLESHEET_PATTERN = /  <link rel="stylesheet" href="\/client\/styles\/legacy-shell\.css">/;
const BODY_OPEN = "<body>";
const VITE_MANIFEST_FILE = path.join("dist", "client", ".vite", "manifest.json");
const VITE_ENTRY_BY_ROLE = {
  stage: "client/app/entries/stage.ts",
  controller: "client/app/entries/controller.ts",
  tools: "client/app/entries/tools.tsx",
  flow: "client/app/entries/flow-tool.tsx",
  constants: "client/app/entries/constants-tool.tsx",
  "host-audio": "client/app/entries/host-audio-tool.tsx",
  layout: "client/app/entries/layout-tool.tsx",
  "controller-layout": "client/app/entries/layout-tool.tsx",
  art: "client/app/entries/art-tool.tsx",
  lab: "client/app/entries/art-tool.tsx"
};
const LEGACY_CSS = {
  base: "/client/styles/legacy/base.css",
  stageRuntime: "/client/styles/legacy/stage-runtime.css",
  controllerRuntime: "/client/styles/legacy/controller-runtime.css",
  tools: "/client/styles/legacy/tools.css",
  responsive: "/client/styles/legacy/responsive.css"
};
const PATH_ROLES = {
  "/stage": "stage",
  "/s": "stage",
  "/controller": "controller",
  "/c": "controller",
  "/lab": "lab",
  "/l": "lab",
  "/art": "art",
  "/a": "art",
  "/flow": "flow",
  "/f": "flow",
  "/constants": "constants",
  "/const": "constants",
  "/host-audio": "host-audio",
  "/host-audios": "host-audio",
  "/audio": "host-audio",
  "/layout": "layout",
  "/layouts": "layout",
  "/controller-layout": "controller-layout",
  "/controller-layouts": "controller-layout",
  "/tools": "tools",
  "/tool": "tools"
};
const REQUESTED_ROLES = new Set(["controller", "lab", "art", "flow", "constants", "host-audio", "layout", "controller-layout", "tools"]);

function routeRoleForUrl(url) {
  const requestedRole = url?.searchParams?.get("role");
  if (REQUESTED_ROLES.has(requestedRole)) return requestedRole;
  const pathname = String(url?.pathname || "").toLowerCase();
  return PATH_ROLES[pathname] || "stage";
}

function viteManifest(root) {
  const manifestPath = path.join(root, VITE_MANIFEST_FILE);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function viteEntryScriptForRole(root, role) {
  const manifest = viteManifest(root);
  const manifestKey = VITE_ENTRY_BY_ROLE[role] || VITE_ENTRY_BY_ROLE.stage;
  const file = manifest?.[manifestKey]?.file;
  if (typeof file !== "string" || !file.startsWith("assets/")) return "";
  return `  <script type="module" src="/${file}"></script>`;
}

function stylesForRole(role) {
  const runtimeStyles = [LEGACY_CSS.base, LEGACY_CSS.stageRuntime, LEGACY_CSS.responsive];
  const controllerStyles = [LEGACY_CSS.base, LEGACY_CSS.stageRuntime, LEGACY_CSS.controllerRuntime, LEGACY_CSS.responsive];
  const toolStyles = [LEGACY_CSS.base, LEGACY_CSS.tools, LEGACY_CSS.responsive];
  const stageToolStyles = [LEGACY_CSS.base, LEGACY_CSS.stageRuntime, LEGACY_CSS.tools, LEGACY_CSS.responsive];
  if (role === "controller") return controllerStyles;
  if (role === "lab" || role === "art" || role === "layout" || role === "controller-layout") return stageToolStyles;
  if (role === "flow" || role === "constants" || role === "host-audio") return toolStyles;
  if (role === "tools") return [LEGACY_CSS.base, LEGACY_CSS.stageRuntime, LEGACY_CSS.controllerRuntime, LEGACY_CSS.tools, LEGACY_CSS.responsive];
  return runtimeStyles;
}

function renderStylesheetLinks(stylesheets) {
  return stylesheets
    .map((stylesheet) => `  <link rel="stylesheet" href="${stylesheet}">`)
    .join("\n");
}

const BLOCK_START = {
  toolDashboardBar: "  <nav class=\"tool-dashboard-bar hidden\" id=\"toolDashboardBar\"",
  unsafeChangesModal: "  <div class=\"unsafe-modal hidden\" id=\"unsafeChangesModal\"",
  stageScreen: "  <section class=\"screen stage hidden\" id=\"stageScreen\"",
  controllerScreen: "  <section class=\"screen controller hidden\" id=\"controllerScreen\"",
  labScreen: "  <section class=\"screen lab hidden\" id=\"labScreen\"",
  artScreen: "  <section class=\"screen art-tool hidden\" id=\"artScreen\"",
  flowScreen: "  <section class=\"screen art-tool hidden\" id=\"flowScreen\"",
  constantsScreen: "  <section class=\"screen art-tool hidden\" id=\"constantsScreen\"",
  hostAudioScreen: "  <section class=\"screen art-tool hidden\" id=\"hostAudioScreen\"",
  layoutScreen: "  <section class=\"screen art-tool hidden\" id=\"layoutScreen\""
};

function blockEndIndex(html, startIndex) {
  const candidates = Object.values(BLOCK_START)
    .map((marker) => html.indexOf(marker, startIndex + 1))
    .filter((index) => index > startIndex);
  const scriptIndex = html.search(LEGACY_SCRIPT_BLOCK_PATTERN);
  if (scriptIndex > startIndex) candidates.push(scriptIndex);
  return Math.min(...candidates);
}

function topLevelBlock(html, blockName) {
  const marker = BLOCK_START[blockName];
  const startIndex = html.indexOf(marker);
  if (startIndex < 0) return "";
  const endIndex = blockEndIndex(html, startIndex);
  if (!Number.isFinite(endIndex) || endIndex <= startIndex) return "";
  return html.slice(startIndex, endIndex).trimEnd();
}

function blockNamesForRole(role) {
  if (role === "controller") return ["controllerScreen"];
  if (role === "lab") return ["labScreen"];
  if (role === "art") return ["artScreen"];
  if (role === "flow") return ["flowScreen"];
  if (role === "constants") return ["constantsScreen"];
  if (role === "host-audio") return ["hostAudioScreen"];
  if (role === "layout" || role === "controller-layout") return ["layoutScreen"];
  if (role === "tools") {
    return [
      "toolDashboardBar",
      "unsafeChangesModal",
      "artScreen",
      "flowScreen",
      "constantsScreen",
      "hostAudioScreen",
      "layoutScreen"
    ];
  }
  return ["stageScreen"];
}

function renderViteBody(html, role) {
  const bodyIndex = html.indexOf(BODY_OPEN);
  const scriptIndex = html.search(LEGACY_SCRIPT_BLOCK_PATTERN);
  if (bodyIndex < 0 || scriptIndex < 0) return html;
  const bodyOpenEnd = bodyIndex + BODY_OPEN.length;
  const blocks = blockNamesForRole(role)
    .map((blockName) => topLevelBlock(html, blockName))
    .filter(Boolean)
    .join("\n\n");
  if (!blocks) return html;
  return `${html.slice(0, bodyOpenEnd)}\n${blocks}\n\n${html.slice(scriptIndex)}`;
}

function runtimeConfigScript(gameDefinition, gamePluginRenderers = [], gamePluginInputs = []) {
  const serialized = JSON.stringify({
    game: {
      id: String(gameDefinition?.gameId || ""),
      version: String(gameDefinition?.version || "")
    },
    semanticRoles: gameDefinition?.semanticRoles || {},
    gamePlugin: {
      actionRunners: (gameDefinition?.registrations?.actions || []).map((registration) => ({
        actionId: registration.id,
        type: registration.id,
        runner: "serverEffect"
      })).concat((gameDefinition?.registrations?.inputs || []).map((registration) => ({
        actionId: registration.id,
        type: registration.id,
        runner: "controllerInputBarrier"
      }))),
      renderers: gamePluginRenderers,
      inputs: gamePluginInputs
    }
  }).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `  <script id="pop-party-runtime-config" type="application/json">${serialized}</script>`;
}

function createStaticFilesRuntime({
  appVersion,
  buildAssetsRoot,
  clientRoot,
  contentTypeForFile,
  gameDefinition,
  gamePluginRenderers = [],
  gamePluginInputs = [],
  indexFile,
  root,
  sendJson,
  sharedRoot,
  viteManifestRoot = root
}) {
  function serveIndex(res, url = null) {
    fs.readFile(indexFile, (error, data) => {
      if (error) {
        sendJson(res, 500, { ok: false, error: "Could not read index.html" });
        return;
      }
      const role = routeRoleForUrl(url);
      const stylesheetLinks = renderStylesheetLinks(stylesForRole(role));
      const viteEntryScript = viteEntryScriptForRole(viteManifestRoot, role);
      const html = renderViteBody(String(data), role)
        .replace(BODY_OPEN, `${BODY_OPEN}\n${runtimeConfigScript(gameDefinition, gamePluginRenderers, gamePluginInputs)}`)
        .replace(LEGACY_STYLESHEET_PATTERN, stylesheetLinks)
        .replace(LEGACY_SCRIPT_BLOCK_PATTERN, viteEntryScript)
        .replaceAll("__APP_VERSION__", appVersion);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html)
      });
      res.end(html);
    });
  }

  function serveStaticFile(res, requestPath, root, label) {
    let decodedPath = "";
    try {
      decodedPath = decodeURIComponent(requestPath || "");
    } catch (error) {
      sendJson(res, 404, { ok: false, error: `${label} file not found` });
      return;
    }
    const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.resolve(root, normalizedPath);
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      sendJson(res, 404, { ok: false, error: `${label} file not found` });
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        sendJson(res, 500, { ok: false, error: `Could not read ${label} file` });
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentTypeForFile(filePath),
        "Content-Length": data.length,
        "Cache-Control": "no-cache"
      });
      res.end(data);
    });
  }

  function serveClientFile(res, requestPath) {
    serveStaticFile(res, requestPath, clientRoot, "Client");
  }

  function serveBuildAsset(res, requestPath) {
    serveStaticFile(res, requestPath, buildAssetsRoot, "Build asset");
  }

  function serveSharedFile(res, requestPath) {
    serveStaticFile(res, requestPath, sharedRoot, "Shared");
  }

  return {
    serveBuildAsset,
    serveClientFile,
    serveIndex,
    serveSharedFile
  };
}

module.exports = { createStaticFilesRuntime, runtimeConfigScript };
