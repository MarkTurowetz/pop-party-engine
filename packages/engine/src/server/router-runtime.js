"use strict";

const { version: ENGINE_RUNTIME_VERSION } = require("../../package.json");

function createRouterRuntime({
  activeRelease,
  adminAuth,
  application,
  clonePrompt,
  contentAdmin,
  contentStatus,
  gameDefinition,
  handleActionEffect,
  handleAdvancePresentation,
  handleCancelStart,
  handleCompleteAction,
  handleControllerChoice,
  handleControllerMicrophoneAccess,
  handleControllerTextSubmit,
  handleGamePluginInput,
  handleHeartbeat,
  handleInputEvent,
  handleJoin,
  handleLeave,
  livePrototype,
  handleLobby,
  handleLocalDraft,
  handlePause,
  handleQuitToLobby,
  handleCleanupArtCompositions,
  handleDeleteArtComposition,
  handleReplaceArtAsset,
  handleSaveArtOrganization,
  handleSaveArtComposition,
  handleSaveArtCompositions,
  handleSaveControllerLayouts,
  handleSaveGameConstants,
  handleSaveGameFlow,
  handleSaveHostAudios,
  handleUploadHostAudioAsset,
  handleSaveStageLayouts,
  handleStart,
  handleStageEvents,
  handleStageTestConfig,
  multipleChoicePrompts,
  normalizeStageCode,
  rooms,
  runtimeCapabilities,
  sendArtAssetList,
  sendControllerLayouts,
  sendGameConstants,
  sendGameFlow,
  sendHostAudios,
  sendJson,
  sendLocalDraft,
  sendStageLayouts,
  sendRoomRuntimeContent,
  serveArtFile,
  serveDurableArtAsset,
  serveBuildAsset,
  serveClientFile,
  serveIndex,
  serveRoomArtAsset,
  serveRoomHostAudio,
  serveDraftHostAudioAsset,
  serveSharedFile,
}) {
  function currentActiveRelease() {
    return typeof activeRelease === "function" ? activeRelease() : activeRelease;
  }

  function router(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (adminAuth?.tryHandle(req, res, url)) return;

    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (adminAuth?.isAdminApiRequest(req, url)) {
      if (!adminAuth.requireApi(req, res, { mutation: req.method !== "GET" })) return;
    }

    if (runtimeCapabilities && !runtimeCapabilities.authorizeRequest(req, res, url)) return;

    if (contentAdmin) {
      if (req.method === "GET" && url.pathname === "/api/content/draft") return void contentAdmin.handleReadDraft(req, res, url);
      if (req.method === "POST" && url.pathname === "/api/content/draft") return void contentAdmin.handleWriteDraft(req, res, url);
      if (req.method === "POST" && url.pathname === "/api/content/validate") return void contentAdmin.handleValidateDraft(req, res, url);
      if (req.method === "POST" && url.pathname === "/api/content/publish") return void contentAdmin.handlePublish(req, res, url);
      if (req.method === "POST" && url.pathname === "/api/content/rollback") return void contentAdmin.handleRollback(req, res);
      if (req.method === "GET" && url.pathname === "/api/content/active-release") return void contentAdmin.handleActiveRelease(req, res);
      if (req.method === "GET" && url.pathname === "/api/content/revisions") return void contentAdmin.handleListRevisions(req, res);
    }

    if (livePrototype) {
      if (req.method === "GET" && url.pathname === "/api/authoring/workspace") {
        livePrototype.sendState(res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/authoring/workspace/session") {
        void livePrototype.handleBegin(req, res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/authoring/workspace/heartbeat") {
        void livePrototype.handleHeartbeat(req, res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/authoring/workspace/discard") {
        void livePrototype.handleDiscard(req, res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/authoring/workspace/checkpoint") {
        void livePrototype.handleCheckpoint(req, res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/authoring/workspace/restore-checkpoint") {
        void livePrototype.handleRestoreCheckpoint(req, res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/authoring/workspace/save") {
        void livePrototype.handleSave(req, res);
        return;
      }
    }
    if (url.pathname.startsWith("/api/authoring/workspace")) {
      sendJson(res, 404, {
        ok: false,
        error: "Live prototype authoring is not enabled",
        errorCode: "LIVE_PROTOTYPE_DISABLED"
      });
      return;
    }
    if (url.pathname.startsWith("/api/content/")) {
      sendJson(res, 404, { ok: false, error: "Revisioned content authoring is not enabled", errorCode: "CONTENT_AUTHORING_DISABLED" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/preview-rooms") {
      runtimeCapabilities.handleCreatePreviewRoom(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stage/rooms") {
      runtimeCapabilities.handleCreateRoom(req, res);
      return;
    }

    if (req.method === "GET" && ["/api/health", "/health", "/healthz"].includes(url.pathname)) {
      sendJson(res, 200, {
        ok: true,
        rooms: rooms.size,
        game: {
          id: gameDefinition?.gameId || "",
          name: gameDefinition?.displayName || "",
          version: gameDefinition?.version || "",
          engineCompatibility: gameDefinition?.engineCompatibility || "",
          contentMode: gameDefinition?.content?.mode || ""
        },
        release: currentActiveRelease() || null,
        application: application || {
          version: "",
          commit: "",
          branch: "",
          channel: "development"
        },
        engine: {
          version: ENGINE_RUNTIME_VERSION,
          capabilities: {
            browserWorkspaceCheckpoints: typeof livePrototype?.handleCheckpoint === "function"
              && typeof livePrototype?.handleRestoreCheckpoint === "function"
          }
        },
        adminAuth: adminAuth?.publicStatus() || { mode: "unknown", protected: false },
        runtimeCapabilities: runtimeCapabilities?.publicStatus() || { mode: "unknown", protected: false },
        contentStore: contentStatus || { mode: "disabled", remoteAuthoring: "disabled", enabled: false }
      });
      return;
    }

    const runtimeContentMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/content\/(stage-layouts|controller-layouts|art-assets)$/i);
    if (req.method === "GET" && runtimeContentMatch) {
      sendRoomRuntimeContent(res, runtimeContentMatch[1], runtimeContentMatch[2]);
      return;
    }

    const runtimeArtAssetMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/content\/art-assets\/([a-z0-9-]+)$/i);
    if (req.method === "GET" && runtimeArtAssetMatch) {
      serveRoomArtAsset(res, runtimeArtAssetMatch[1], runtimeArtAssetMatch[2], url.searchParams.get("revision"));
      return;
    }

    const runtimeHostAudioMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/content\/host-audio\/([a-z0-9-]+)$/i);
    if (req.method === "GET" && runtimeHostAudioMatch) {
      serveRoomHostAudio(res, runtimeHostAudioMatch[1], runtimeHostAudioMatch[2], url.searchParams.get("revision"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/art-assets") {
      sendArtAssetList(res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    const durableArtAssetMatch = url.pathname.match(/^\/api\/art-assets\/([a-z0-9-]+)\/blob$/i);
    if (req.method === "GET" && durableArtAssetMatch) {
      serveDurableArtAsset(res, durableArtAssetMatch[1]);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/art-organization") {
      handleSaveArtOrganization(req, res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/art-compositions") {
      handleSaveArtCompositions(req, res).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/art-compositions/cleanup") {
      handleCleanupArtCompositions(req, res).catch((error) => {
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

    if (req.method === "POST" && url.pathname === "/api/host-audios/assets") {
      handleUploadHostAudioAsset(req, res);
      return;
    }

    const draftHostAudioMatch = url.pathname.match(/^\/api\/host-audios\/assets\/([a-z0-9-]+)\/([a-z0-9-]+)$/i);
    if (req.method === "GET" && draftHostAudioMatch) {
      serveDraftHostAudioAsset(res, draftHostAudioMatch[1], draftHostAudioMatch[2]);
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
    if (req.method === "DELETE" && artCompositionMatch) {
      handleDeleteArtComposition(req, res, artCompositionMatch[1]).catch((error) => {
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

    const buildAssetMatch = url.pathname.match(/^\/assets\/([^/]+)$/i);
    if (req.method === "GET" && buildAssetMatch) {
      serveBuildAsset(res, buildAssetMatch[1]);
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      sendJson(res, 404, { ok: false, error: "Build asset file not found" });
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

    const stageEventTicketMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/event-ticket$/i);
    if (req.method === "POST" && stageEventTicketMatch) {
      runtimeCapabilities.handleCreateEventTicket(req, res, normalizeStageCode(stageEventTicketMatch[1]));
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

    if (req.method === "POST" && url.pathname === "/api/pause") {
      handlePause(req, res);
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

    if (req.method === "POST" && url.pathname === "/api/controller-microphone-access") {
      handleControllerMicrophoneAccess(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/controller-text-submit") {
      handleControllerTextSubmit(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/game-plugin-input") {
      handleGamePluginInput(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/quit-to-lobby") {
      handleQuitToLobby(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (adminAuth?.isToolPath(url) && !adminAuth.requirePage(req, res, url)) return;
      serveIndex(res, url);
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  return { router };
}

module.exports = { createRouterRuntime };
