const fs = require("fs");
const path = require("path");
const legacyScriptManifest = require("../client/app/legacy/script-manifest.json");

const APP_SHELL_SCRIPT = "/client/app/legacy/app-shell.js";
const LEGACY_SCRIPT_BLOCK_PATTERN = /  <script src="\/shared\/color-utils\.js"><\/script>\n[\s\S]*?  <script src="\/client\/app\/legacy\/app-shell\.js"><\/script>/;
const LEGACY_STYLESHEET_PATTERN = /  <link rel="stylesheet" href="\/client\/styles\/legacy-shell\.css">/;
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

function scriptsForRole(role) {
  const {
    sharedFoundation,
    stageRuntime,
    controllerRuntime,
    toolFoundation,
    artTool,
    hostAudioTool,
    flowTool,
    constantsTool,
    layoutTool
  } = legacyScriptManifest;
  const allToolScripts = [
    ...artTool,
    ...hostAudioTool,
    ...flowTool,
    ...constantsTool,
    ...layoutTool
  ];
  if (role === "controller") return [...sharedFoundation, ...controllerRuntime];
  if (role === "lab" || role === "art") return [...sharedFoundation, ...stageRuntime, ...toolFoundation, ...artTool];
  if (role === "flow") return [...sharedFoundation, ...toolFoundation, ...flowTool];
  if (role === "constants") return [...sharedFoundation, ...toolFoundation, ...constantsTool];
  if (role === "host-audio") return [...sharedFoundation, ...toolFoundation, ...hostAudioTool];
  if (role === "layout" || role === "controller-layout") return [...sharedFoundation, ...stageRuntime, ...toolFoundation, ...layoutTool];
  if (role === "tools") return [...sharedFoundation, ...stageRuntime, ...controllerRuntime, ...toolFoundation, ...allToolScripts];
  return [...sharedFoundation, ...stageRuntime];
}

function renderScriptTags(scripts) {
  return [...scripts, APP_SHELL_SCRIPT]
    .map((script) => `  <script src="${script}"></script>`)
    .join("\n");
}

function shouldUseViteEntry(url, useViteEntriesByDefault = false) {
  return useViteEntriesByDefault || url?.searchParams?.get("vite") === "1";
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

function createStaticFilesRuntime({
  appVersion,
  buildAssetsRoot,
  clientRoot,
  contentTypeForFile,
  indexFile,
  root,
  sendJson,
  sharedRoot,
  useViteEntriesByDefault = false
}) {
  function serveIndex(res, url = null) {
    fs.readFile(indexFile, (error, data) => {
      if (error) {
        sendJson(res, 500, { ok: false, error: "Could not read index.html" });
        return;
      }
      const role = routeRoleForUrl(url);
      const stylesheetLinks = renderStylesheetLinks(stylesForRole(role));
      const viteEntryScript = shouldUseViteEntry(url, useViteEntriesByDefault) ? viteEntryScriptForRole(root, role) : "";
      const scriptTags = viteEntryScript || renderScriptTags(scriptsForRole(role));
      const html = String(data)
        .replace(LEGACY_STYLESHEET_PATTERN, stylesheetLinks)
        .replace(LEGACY_SCRIPT_BLOCK_PATTERN, scriptTags)
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

module.exports = { createStaticFilesRuntime };
