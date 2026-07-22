import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createContentAdminHandlersRuntime } = require("./content-admin-handlers-runtime");

function harness(body = {}) {
  const response = {};
  const contentStore = {
    readDraft: vi.fn(async () => ({ scope: "default", revision: "draft-1", snapshot: { manifest: { rootHash: "draft-1" } } })),
    writeDraft: vi.fn(async () => ({ scope: "default", parentRevision: "draft-1", revision: "draft-2" })),
    validateDraft: vi.fn(async () => ({ scope: "default", revision: "draft-2", ok: true, diagnostics: [] })),
    publishDraft: vi.fn(async () => ({ contentRevision: "draft-2", release: { releaseRevision: "release-2" } })),
    rollback: vi.fn(async () => ({ contentRevision: "draft-1", release: { releaseRevision: "release-3" } })),
    getActiveRelease: vi.fn(async () => ({ releaseRevision: "release-2" })),
    listRevisions: vi.fn(async () => [{ revision: "draft-2", active: true }])
  };
  const sendJson = vi.fn((_res, status, payload) => Object.assign(response, { status, payload }));
  const audit = vi.fn();
  return {
    audit,
    contentStore,
    response,
    runtime: createContentAdminHandlersRuntime({ contentStore, readJson: async () => body, sendJson, audit })
  };
}

function request(idempotencyKey = "request-key-0001") {
  return { headers: { "idempotency-key": idempotencyKey }, url: "/api/content/draft" };
}

describe("content admin HTTP contracts", () => {
  it("passes expected revision and idempotency key into draft saves", async () => {
    const test = harness({ expectedRevision: "draft-1", replacements: { "flow.json": { states: [] } } });
    await test.runtime.handleWriteDraft(request(), {}, new URL("http://test/api/content/draft"));

    expect(test.response).toMatchObject({ status: 200, payload: { ok: true, revision: "draft-2" } });
    expect(test.contentStore.writeDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: "draft-1",
      idempotencyKey: "request-key-0001",
      replacements: { "flow.json": { states: [] } }
    }));
    expect(test.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ operation: "draft-write", outcome: "success" }));
  });

  it("maps store conflicts to HTTP 409 without retrying", async () => {
    const test = harness({ expectedRevision: "stale", replacements: { "flow.json": { states: [] } } });
    test.contentStore.writeDraft.mockRejectedValue(Object.assign(new Error("stale"), {
      status: 409,
      code: "DRAFT_REVISION_CONFLICT",
      expectedRevision: "stale",
      actualRevision: "draft-2"
    }));
    await test.runtime.handleWriteDraft(request(), {}, new URL("http://test/api/content/draft"));

    expect(test.response).toMatchObject({
      status: 409,
      payload: { ok: false, errorCode: "DRAFT_REVISION_CONFLICT", expectedRevision: "stale", actualRevision: "draft-2" }
    });
    expect(test.contentStore.writeDraft).toHaveBeenCalledTimes(1);
  });

  it("refuses arbitrary bundle paths on the JSON mutation endpoint", async () => {
    const test = harness({ expectedRevision: "draft-1", replacements: { "blobs/unsafe.svg": "<svg/>" } });
    await test.runtime.handleWriteDraft(request(), {}, new URL("http://test/api/content/draft"));
    expect(test.response).toMatchObject({ status: 400, payload: { ok: false, errorCode: "CONTENT_OPERATION_FAILED" } });
    expect(test.contentStore.writeDraft).not.toHaveBeenCalled();
  });

  it("passes both draft and active expected revisions into publish", async () => {
    const release = { gameBuild: "1052", engineVersion: "1.0.0", pluginVersion: "1.0.0" };
    const test = harness({ expectedDraftRevision: "draft-2", expectedActiveRevision: "release-1", release });
    await test.runtime.handlePublish(request("publish-key-0001"), {}, new URL("http://test/api/content/publish"));
    expect(test.contentStore.publishDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedDraftRevision: "draft-2",
      expectedActiveRevision: "release-1",
      idempotencyKey: "publish-key-0001",
      release
    }));
  });
});
