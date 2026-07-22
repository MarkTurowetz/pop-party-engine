"use strict";

const { normalizeBundlePath } = require("../shared/content-bundle-schema");

const MUTABLE_JSON_PATHS = new Set([
  "flow.json",
  "constants.json",
  "layouts/stage.json",
  "layouts/controller.json",
  "audio/host-audios.json",
  "art/manifest.json",
  "prompts/prompts.json",
  "semantic-roles.json"
]);

function createContentAdminHandlersRuntime(options = {}) {
  const contentStore = options.contentStore;
  const readJson = options.readJson;
  const sendJson = options.sendJson;
  const audit = typeof options.audit === "function" ? options.audit : () => {};
  if (!contentStore) throw new Error("Content admin handlers require a content store");

  function scopeFrom(url, payload = {}) {
    return String(payload.scope || url?.searchParams?.get("scope") || "default");
  }

  function failure(req, res, error, operation) {
    const status = Number(error.status || (error.code === "CONTENT_VALIDATION_FAILED" ? 422 : 400));
    audit(req, {
      operation,
      outcome: "failed",
      expectedRevision: error.expectedRevision,
      resultRevision: error.actualRevision,
      errorCode: error.code || "CONTENT_OPERATION_FAILED"
    });
    sendJson(res, status, {
      ok: false,
      error: error.message,
      errorCode: error.code || "CONTENT_OPERATION_FAILED",
      expectedRevision: error.expectedRevision || "",
      actualRevision: error.actualRevision || "",
      diagnostics: error.diagnostics || []
    });
  }

  async function payload(req, res) {
    try {
      return await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload", errorCode: "INVALID_JSON" });
      return null;
    }
  }

  async function handleReadDraft(req, res, url) {
    try {
      const draft = await contentStore.readDraft(scopeFrom(url));
      sendJson(res, 200, {
        ok: true,
        scope: draft.scope,
        revision: draft.revision,
        manifest: draft.snapshot.manifest
      });
    } catch (error) {
      failure(req, res, error, "draft-read");
    }
  }

  async function handleWriteDraft(req, res, url) {
    const body = await payload(req, res);
    if (!body) return;
    try {
      const replacements = {};
      for (const [rawPath, value] of Object.entries(body.replacements || {})) {
        const logicalPath = normalizeBundlePath(rawPath);
        if (!MUTABLE_JSON_PATHS.has(logicalPath)) throw new Error(`Draft JSON path cannot be mutated through this endpoint: ${logicalPath}`);
        replacements[logicalPath] = value;
      }
      if (!Object.keys(replacements).length) throw new Error("At least one content replacement is required");
      const result = await contentStore.writeDraft({
        scope: scopeFrom(url, body),
        expectedRevision: body.expectedRevision,
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
        replacements
      });
      audit(req, { operation: "draft-write", outcome: "success", expectedRevision: result.parentRevision, resultRevision: result.revision });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      failure(req, res, error, "draft-write");
    }
  }

  async function handleValidateDraft(req, res, url) {
    const body = await payload(req, res);
    if (!body) return;
    try {
      const result = await contentStore.validateDraft(scopeFrom(url, body));
      audit(req, { operation: "draft-validate", outcome: result.ok ? "success" : "failed", resultRevision: result.revision, errorCode: result.ok ? "" : "CONTENT_VALIDATION_FAILED" });
      sendJson(res, result.ok ? 200 : 422, { ok: result.ok, ...result });
    } catch (error) {
      failure(req, res, error, "draft-validate");
    }
  }

  async function handlePublish(req, res, url) {
    const body = await payload(req, res);
    if (!body) return;
    try {
      const result = await contentStore.publishDraft({
        scope: scopeFrom(url, body),
        expectedDraftRevision: body.expectedDraftRevision,
        expectedActiveRevision: body.expectedActiveRevision,
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
        release: body.release
      });
      audit(req, { operation: "content-publish", outcome: "success", expectedRevision: body.expectedActiveRevision, resultRevision: result.release.releaseRevision });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      failure(req, res, error, "content-publish");
    }
  }

  async function handleRollback(req, res) {
    const body = await payload(req, res);
    if (!body) return;
    try {
      const result = await contentStore.rollback({
        targetContentRevision: body.targetContentRevision,
        expectedActiveRevision: body.expectedActiveRevision,
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
        release: body.release
      });
      audit(req, { operation: "content-rollback", outcome: "success", expectedRevision: body.expectedActiveRevision, resultRevision: result.release.releaseRevision });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      failure(req, res, error, "content-rollback");
    }
  }

  async function handleActiveRelease(req, res) {
    try {
      sendJson(res, 200, { ok: true, release: await contentStore.getActiveRelease() });
    } catch (error) {
      failure(req, res, error, "active-release-read");
    }
  }

  async function handleListRevisions(req, res) {
    try {
      sendJson(res, 200, { ok: true, revisions: await contentStore.listRevisions() });
    } catch (error) {
      failure(req, res, error, "content-revisions-read");
    }
  }

  return Object.freeze({
    handleActiveRelease,
    handleListRevisions,
    handlePublish,
    handleReadDraft,
    handleRollback,
    handleValidateDraft,
    handleWriteDraft
  });
}

module.exports = { MUTABLE_JSON_PATHS, createContentAdminHandlersRuntime };
