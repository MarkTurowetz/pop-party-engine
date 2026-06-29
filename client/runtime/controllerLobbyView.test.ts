import { describe, expect, it, vi } from "vitest";
import { createControllerLobbyView } from "./controllerLobbyView";

describe("createControllerLobbyView (ported)", () => {
  it("exposes the lobby render surface", () => {
    const view = createControllerLobbyView({
      applyLayoutForPhase: vi.fn(),
      elements: {} as never,
      hideViews: vi.fn(),
      setAvatar: vi.fn(),
      showView: vi.fn()
    });
    expect(view.renderLobby).toBeTypeOf("function");
    expect(view.renderInGamePhase).toBeTypeOf("function");
    expect(view.renderMissingPlayer).toBeTypeOf("function");
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerLobbyView?: unknown };
    expect(host.createControllerLobbyView).toBeTypeOf("function");
  });
});
