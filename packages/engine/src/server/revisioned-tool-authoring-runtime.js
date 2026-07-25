"use strict";

const crypto = require("node:crypto");
const { normalizeBundlePath } = require("../shared/content-bundle-schema");

function idempotencyKey(value, prefix = "tool-save") {
  const supplied = String(value || "").trim();
  if (supplied) return supplied;
  return `${prefix}:${crypto.randomUUID()}`;
}

function createRevisionedToolAuthoringRuntime(options = {}) {
  const contentStore = options.contentStore;
  const scope = String(options.scope || "default");
  if (!contentStore
    || typeof contentStore.readDraft !== "function"
    || typeof contentStore.writeDraft !== "function") {
    throw new Error("Revisioned Tool authoring requires a writable content store");
  }

  let currentDraft = null;
  let writeQueue = Promise.resolve();

  async function initialize() {
    if (typeof contentStore.initializeDraft === "function") {
      await contentStore.initializeDraft(scope);
    }
    currentDraft = await contentStore.readDraft(scope);
    return currentDraft;
  }

  async function readDraft({ refresh = false } = {}) {
    if (!currentDraft && typeof contentStore.initializeDraft === "function") {
      await contentStore.initializeDraft(scope);
    }
    if (!currentDraft || refresh) currentDraft = await contentStore.readDraft(scope);
    return currentDraft;
  }

  async function readJson(logicalPath, { refresh = false } = {}) {
    const draft = await readDraft({ refresh });
    return {
      revision: draft.revision,
      value: draft.snapshot.readJson(normalizeBundlePath(logicalPath))
    };
  }

  function writeFiles(replacements, metadata = {}) {
    const operation = async () => {
      const draft = await readDraft({ refresh: true });
      const requestedRevision = String(metadata.expectedRevision || "");
      if (!requestedRevision) {
        const error = new Error("A draft revision is required");
        error.name = "ContentStoreConflictError";
        error.code = "DRAFT_REVISION_REQUIRED";
        error.status = 409;
        error.actualRevision = draft.revision;
        throw error;
      }
      if (requestedRevision !== draft.revision) {
        const error = new Error("Draft revision is stale");
        error.name = "ContentStoreConflictError";
        error.code = "DRAFT_REVISION_CONFLICT";
        error.status = 409;
        error.expectedRevision = requestedRevision;
        error.actualRevision = draft.revision;
        throw error;
      }
      const result = await contentStore.writeDraft({
        scope,
        expectedRevision: draft.revision,
        idempotencyKey: idempotencyKey(metadata.idempotencyKey, metadata.operation || "tool-save"),
        replacements
      });
      currentDraft = await contentStore.readDraft(scope);
      if (currentDraft.revision !== result.revision) {
        throw Object.assign(new Error("Durable draft verification failed after save"), {
          code: "DRAFT_WRITE_VERIFICATION_FAILED"
        });
      }
      return {
        scope,
        revision: currentDraft.revision,
        parentRevision: result.parentRevision,
        snapshot: currentDraft.snapshot
      };
    };
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function writeJson(logicalPath, value, metadata = {}) {
    const normalizedPath = normalizeBundlePath(logicalPath);
    const result = await writeFiles({ [normalizedPath]: value }, metadata);
    return {
      ...result,
      value: result.snapshot.readJson(normalizedPath)
    };
  }

  function status() {
    return Object.freeze({
      kind: "github-app-draft",
      durable: true,
      scope,
      revision: currentDraft?.revision || ""
    });
  }

  return Object.freeze({
    initialize,
    readDraft,
    readJson,
    status,
    writeFiles,
    writeJson
  });
}

module.exports = Object.freeze({ createRevisionedToolAuthoringRuntime, idempotencyKey });
