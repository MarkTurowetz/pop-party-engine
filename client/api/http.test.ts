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
});
