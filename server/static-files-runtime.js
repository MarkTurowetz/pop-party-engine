const fs = require("fs");
const path = require("path");

function createStaticFilesRuntime({
  appVersion,
  clientRoot,
  contentTypeForFile,
  indexFile,
  sendJson,
  sharedRoot
}) {
  function serveIndex(res) {
    fs.readFile(indexFile, (error, data) => {
      if (error) {
        sendJson(res, 500, { ok: false, error: "Could not read index.html" });
        return;
      }
      const html = String(data).replaceAll("__APP_VERSION__", appVersion);
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

  function serveSharedFile(res, requestPath) {
    serveStaticFile(res, requestPath, sharedRoot, "Shared");
  }

  return {
    serveClientFile,
    serveIndex,
    serveSharedFile
  };
}

module.exports = { createStaticFilesRuntime };
