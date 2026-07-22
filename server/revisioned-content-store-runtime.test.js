import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const schema = require("../shared/content-bundle-schema");
const { buildManifest, createContentSnapshot } = require("./content-snapshot-runtime");
const { ContentStoreConflictError, createRevisionedContentStoreRuntime } = require("./revisioned-content-store-runtime");

function fixtureSnapshot() {
  const files = new Map(schema.REQUIRED_CONTENT_PATHS.map((logicalPath) => [
    logicalPath,
    Buffer.from(`${JSON.stringify({ path: logicalPath, value: 1 })}\n`)
  ]));
  const manifest = buildManifest({
    schemaVersion: 1,
    gameId: "example-game",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json"
  }, files);
  return createContentSnapshot({ manifest, files });
}

function store(options = {}) {
  return createRevisionedContentStoreRuntime({
    initialSnapshot: fixtureSnapshot(),
    initialRelease: { gameBuild: "100", engineVersion: "1.0.0", pluginVersion: "1.0.0" },
    ...options
  });
}

const publishMetadata = { gameBuild: "101", engineVersion: "1.0.0", pluginVersion: "1.0.0" };

describe("revisioned content store", () => {
  it("requires optimistic revisions and never silently overwrites a draft", () => {
    const runtime = store();
    const initial = runtime.readDraft("mark");
    const saved = runtime.writeDraft({
      scope: "mark",
      expectedRevision: initial.revision,
      idempotencyKey: "save-request-0001",
      replacements: { "constants.json": { gameTitle: "First" } }
    });

    expect(saved.parentRevision).toBe(initial.revision);
    expect(() => runtime.writeDraft({
      scope: "mark",
      expectedRevision: initial.revision,
      idempotencyKey: "save-request-0002",
      replacements: { "constants.json": { gameTitle: "Stale" } }
    })).toThrowError(expect.objectContaining({ code: "DRAFT_REVISION_CONFLICT", status: 409 }));
    expect(runtime.readDraft("mark").snapshot.readJson("constants.json")).toEqual({ gameTitle: "First" });
  });

  it("replays an idempotent save but rejects key reuse with another request", () => {
    const runtime = store();
    const initial = runtime.readDraft();
    const request = {
      expectedRevision: initial.revision,
      idempotencyKey: "save-request-0001",
      replacements: { "constants.json": { gameTitle: "One" } }
    };
    const first = runtime.writeDraft(request);
    expect(runtime.writeDraft(request)).toBe(first);
    expect(() => runtime.writeDraft({ ...request, replacements: { "constants.json": { gameTitle: "Two" } } })).toThrowError(
      expect.objectContaining({ code: "IDEMPOTENCY_KEY_REUSE" })
    );
  });

  it("publishes a complete validated snapshot with active-release compare-and-swap", () => {
    const validateSnapshot = vi.fn(() => ({ ok: true, diagnostics: [] }));
    const runtime = store({ validateSnapshot });
    const initialRelease = runtime.getActiveRelease();
    const initialDraft = runtime.readDraft();
    const draft = runtime.writeDraft({
      expectedRevision: initialDraft.revision,
      idempotencyKey: "save-request-0001",
      replacements: { "flow.json": { states: [{ id: "lobby" }] } }
    });
    const published = runtime.publishDraft({
      expectedDraftRevision: draft.revision,
      expectedActiveRevision: initialRelease.releaseRevision,
      idempotencyKey: "publish-request-0001",
      release: publishMetadata
    });

    expect(published.contentRevision).toBe(draft.revision);
    expect(runtime.getActiveRelease()).toMatchObject({ contentRevision: draft.revision, gameBuild: "101" });
    expect(runtime.loadPublishedRevision(draft.revision).readJson("flow.json")).toEqual({ states: [{ id: "lobby" }] });
    expect(validateSnapshot).toHaveBeenCalled();

    expect(() => runtime.publishDraft({
      expectedDraftRevision: draft.revision,
      expectedActiveRevision: initialRelease.releaseRevision,
      idempotencyKey: "publish-request-0002",
      release: publishMetadata
    })).toThrowError(expect.objectContaining({ code: "ACTIVE_RELEASE_CONFLICT" }));
  });

  it("rolls back only to a known published revision and creates a new release record", () => {
    const runtime = store();
    const originalRelease = runtime.getActiveRelease();
    const originalContentRevision = originalRelease.contentRevision;
    const draft = runtime.readDraft();
    const saved = runtime.writeDraft({
      expectedRevision: draft.revision,
      idempotencyKey: "save-request-0001",
      replacements: { "constants.json": { gameTitle: "Published" } }
    });
    const published = runtime.publishDraft({
      expectedDraftRevision: saved.revision,
      expectedActiveRevision: originalRelease.releaseRevision,
      idempotencyKey: "publish-request-0001",
      release: publishMetadata
    });
    const rolledBack = runtime.rollback({
      targetContentRevision: originalContentRevision,
      expectedActiveRevision: published.release.releaseRevision,
      idempotencyKey: "rollback-request-0001",
      release: { ...publishMetadata, gameBuild: "102" }
    });

    expect(rolledBack.contentRevision).toBe(originalContentRevision);
    expect(rolledBack.release.previousReleaseRevision).toBe(published.release.releaseRevision);
    expect(rolledBack.release.releaseRevision).not.toBe(originalRelease.releaseRevision);
  });

  it("returns structured conflicts for callers to map to HTTP 409", () => {
    const error = new ContentStoreConflictError("stale", { code: "TEST", expectedRevision: "a", actualRevision: "b" });
    expect(error).toMatchObject({ status: 409, code: "TEST", expectedRevision: "a", actualRevision: "b" });
  });
});
