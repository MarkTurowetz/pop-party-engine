"use strict";

function createRouterRuntime({
  clonePrompt,
  handleActionEffect,
  handleAdvancePresentation,
  handleCancelStart,
  handleCompleteAction,
  handleControllerChoice,
  handleControllerTextSubmit,
  handleHeartbeat,
  handleInputEvent,
  handleJoin,
  handleLeave,
  handleLobby,
  handleLocalDraft,
  handlePresentHi,
  handleQuitToLobby,
  handleReplaceArtAsset,
  handleSaveArtComposition,
  handleSaveControllerLayouts,
  handleSaveGameConstants,
  handleSaveGameFlow,
  handleSaveHostAudios,
  handleSaveStageLayouts,
  handleSelectAvatar,
  handleStart,
  handleStageEvents,
  handleStageTestConfig,
  multipleChoicePrompts,
  normalizeStageCode,
  rooms,
  sendArtAssetList,
  sendControllerLayouts,
  sendGameConstants,
  sendGameFlow,
  sendHostAudios,
  sendJson,
  sendLocalDraft,
  sendStageLayouts,
  serveArtFile,
  serveClientFile,
  serveIndex,
  serveSharedFile,
}) {
  function router(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, rooms: rooms.size });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/art-assets") {
      sendArtAssetList(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/local-draft" || url.pathname === "/api/tool-drafts")) {
      sendLocalDraft(res);
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/local-draft" || url.pathname === "/api/tool-drafts")) {
      handleLocalDraft(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/game-flow") {
      sendGameFlow(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/game-flow") {
      handleSaveGameFlow(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/game-constants") {
      sendGameConstants(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/game-constants") {
      handleSaveGameConstants(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/host-audios") {
      sendHostAudios(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/host-audios") {
      handleSaveHostAudios(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/multiple-choice-prompts") {
      sendJson(res, 200, { ok: true, prompts: multipleChoicePrompts.map(clonePrompt) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stage-layouts") {
      sendStageLayouts(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stage-layouts") {
      handleSaveStageLayouts(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/controller-layouts") {
      sendControllerLayouts(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/controller-layouts") {
      handleSaveControllerLayouts(req, res);
      return;
    }

    const artAssetMatch = url.pathname.match(/^\/api\/art-assets\/([a-z0-9-]+)$/i);
    if (req.method === "POST" && artAssetMatch) {
      handleReplaceArtAsset(req, res, artAssetMatch[1]).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    const artCompositionMatch = url.pathname.match(/^\/api\/art-compositions\/([a-z0-9-]+)$/i);
    if (req.method === "POST" && artCompositionMatch) {
      handleSaveArtComposition(req, res, artCompositionMatch[1]).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    const artFileMatch = url.pathname.match(/^\/art\/(default|custom)\/([^/]+)$/i);
    if (req.method === "GET" && artFileMatch) {
      serveArtFile(res, artFileMatch[1], artFileMatch[2]);
      return;
    }

    const clientFileMatch = url.pathname.match(/^\/client\/(.+)$/i);
    if (req.method === "GET" && clientFileMatch) {
      serveClientFile(res, clientFileMatch[1]);
      return;
    }

    const sharedFileMatch = url.pathname.match(/^\/shared\/(.+)$/i);
    if (req.method === "GET" && sharedFileMatch) {
      serveSharedFile(res, sharedFileMatch[1]);
      return;
    }

    const eventMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/events$/i);
    if (req.method === "GET" && eventMatch) {
      handleStageEvents(req, res, normalizeStageCode(eventMatch[1]));
      return;
    }

    const lobbyMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/lobby$/i);
    if (req.method === "GET" && lobbyMatch) {
      handleLobby(req, res, normalizeStageCode(lobbyMatch[1]));
      return;
    }

    const stageTestConfigMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/test-config$/i);
    if (req.method === "POST" && stageTestConfigMatch) {
      handleStageTestConfig(req, res, normalizeStageCode(stageTestConfigMatch[1]));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/join") {
      handleJoin(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/heartbeat") {
      handleHeartbeat(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/avatar") {
      handleSelectAvatar(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/leave") {
      handleLeave(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/start") {
      handleStart(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/cancel-start") {
      handleCancelStart(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/advance-presentation") {
      handleAdvancePresentation(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/complete-action") {
      handleCompleteAction(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/input-event") {
      handleInputEvent(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/action-effect") {
      handleActionEffect(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/controller-choice") {
      handleControllerChoice(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/controller-text-submit") {
      handleControllerTextSubmit(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/quit-to-lobby") {
      handleQuitToLobby(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/present-hi") {
      handlePresentHi(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveIndex(res);
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  return { router };
}

module.exports = { createRouterRuntime };
