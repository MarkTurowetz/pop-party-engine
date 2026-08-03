import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./http";

describe("tool API CSRF", () => {
  it("loads one admin session token and attaches it to mutations", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, csrfToken: "csrf-123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createApiClient({ fetchImpl, adminCsrf: true });

    await client.postJson("/api/game-flow", { flow: {} });
    await client.deleteJson("/api/art-compositions/test");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf-123" });
    expect(fetchImpl.mock.calls[2][1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf-123" });
  });

  it("does not add admin-session traffic to public clients", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await createApiClient({ fetchImpl }).postJson("/api/join", { name: "Ava" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes a cached CSRF token once after the administrator session is renewed", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, csrfToken: "csrf-old" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        error: "CSRF token is missing or invalid",
        code: "ADMIN_CSRF_INVALID"
      }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, csrfToken: "csrf-new" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createApiClient({ fetchImpl, adminCsrf: true });

    await client.postJson("/api/tool-drafts", { constants: {} });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[1][1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf-old" });
    expect(fetchImpl.mock.calls[3][1]?.headers).toMatchObject({ "X-CSRF-Token": "csrf-new" });
  });

  it("coalesces authoring-session recovery and retries a rejected mutation exactly once", async () => {
    const stale = new Response(JSON.stringify({
      ok: false,
      error: "The live prototype authoring session is no longer active",
      errorCode: "AUTHORING_SESSION_STALE"
    }), { status: 409 });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const recover = vi.fn(async () => undefined);
    const client = createApiClient({ fetchImpl });
    client.setMutationRecoveryHandler(recover);

    await client.postJson("/api/tool-drafts", { constants: { gameTitle: "Preserved" } });

    expect(recover).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/api/tool-drafts"
    }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(fetchImpl.mock.calls[0][1]?.body);
  });
});
