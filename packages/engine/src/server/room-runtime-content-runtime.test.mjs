import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRoomRuntimeContentRuntime } = require("./room-runtime-content-runtime");

function harness({ room: roomOverride } = {}) {
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>');
  const room = roomOverride || {
    releasePin: { contentRevision: "content-1" },
    contentSnapshot: { readBytes: vi.fn(() => bytes) },
    gameData: {
      defaultStageLayouts: { states: [{ id: "stage-pinned" }] },
      defaultControllerLayouts: { states: [{ id: "controller-pinned" }] },
      artGroups: [{ id: "group" }],
      artOrganization: { stage: { order: ["logo"] } },
      defaultArtCompositions: [{ id: "composition" }],
      artAssets: [{ id: "logo", name: "Logo", mimeType: "image/svg+xml", blobPath: "blobs/logo.svg", sourceName: "logo.svg" }]
    }
  };
  const sendJson = vi.fn();
  const runtime = createRoomRuntimeContentRuntime({
    getExistingRoom: (stageCode) => stageCode === "ABCD" ? room : null,
    normalizeStageCode: (value) => String(value || "").toUpperCase(),
    sendJson
  });
  return { bytes, room, runtime, sendJson };
}

describe("room runtime content", () => {
  it("returns layouts and art only from the room's materialized pin", () => {
    const { runtime, sendJson } = harness();
    const response = {};

    runtime.sendRoomRuntimeContent(response, "abcd", "stage-layouts");
    expect(sendJson).toHaveBeenLastCalledWith(response, 200, expect.objectContaining({
      layouts: { states: [{ id: "stage-pinned" }] },
      revision: "content-1"
    }));

    runtime.sendRoomRuntimeContent(response, "abcd", "art-assets");
    expect(sendJson).toHaveBeenLastCalledWith(response, 200, expect.objectContaining({
      assets: [expect.objectContaining({
        id: "logo",
        currentUrl: "/api/stage/ABCD/content/art-assets/logo",
        requiresAuthenticatedFetch: true
      })],
      compositions: [{ id: "composition" }],
      revision: "content-1"
    }));
  });

  it("serves validated pinned bytes with private immutable headers", () => {
    const { bytes, room, runtime } = harness();
    const response = { writeHead: vi.fn(), end: vi.fn() };

    runtime.serveRoomArtAsset(response, "abcd", "logo");

    expect(room.contentSnapshot.readBytes).toHaveBeenCalledWith("blobs/logo.svg");
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }));
    expect(response.end).toHaveBeenCalledWith(bytes);
  });

  it("fails closed for missing rooms and unpinned content", () => {
    const missing = harness();
    missing.runtime.sendRoomRuntimeContent({}, "NOPE", "stage-layouts");
    expect(missing.sendJson).toHaveBeenLastCalledWith({}, 404, expect.objectContaining({ errorCode: "ROOM_NOT_FOUND" }));

    const unpinned = harness({ room: {} });
    unpinned.runtime.sendRoomRuntimeContent({}, "ABCD", "stage-layouts");
    expect(unpinned.sendJson).toHaveBeenLastCalledWith({}, 409, expect.objectContaining({ errorCode: "ROOM_CONTENT_NOT_PINNED" }));
  });
});
