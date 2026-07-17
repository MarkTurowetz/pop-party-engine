import { describe, expect, it, vi } from "vitest";
import { createControllerLobbyView } from "./controllerLobbyView";

describe("createControllerLobbyView (ported)", () => {
  it("exposes the lobby render surface", () => {
    const view = createControllerLobbyView({
      applyLayoutForPhase: vi.fn(),
      disposeStartButton: vi.fn(),
      elements: {} as never,
      getStartButton: () => ({} as HTMLButtonElement),
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

  it("uses the selected layout without mounting a legacy intro controller view", () => {
    const applyLayoutForPhase = vi.fn();
    const hideViews = vi.fn();
    const showView = vi.fn();
    const view = createControllerLobbyView({
      applyLayoutForPhase,
      disposeStartButton: vi.fn(),
      elements: {} as never,
      getStartButton: () => ({} as HTMLButtonElement),
      hideViews,
      setAvatar: vi.fn(),
      showView
    });

    view.renderInGamePhase({ isVip: true }, "intro");
    expect(hideViews).toHaveBeenCalledOnce();
    expect(applyLayoutForPhase).toHaveBeenCalledWith("intro");
    expect(showView).not.toHaveBeenCalled();
  });

  it("returns a missing player directly to the authored Join layout", () => {
    const applyLayoutForPhase = vi.fn();
    const disposeStartButton = vi.fn();
    const hideViews = vi.fn();
    const showView = vi.fn();
    const view = createControllerLobbyView({
      applyLayoutForPhase,
      disposeStartButton,
      elements: { meta: {} as HTMLElement } as never,
      getStartButton: () => ({} as HTMLButtonElement),
      hideViews,
      setAvatar: vi.fn(),
      setText: vi.fn(),
      showView
    });

    view.renderMissingPlayer();

    expect(disposeStartButton).toHaveBeenCalledOnce();
    expect(applyLayoutForPhase).toHaveBeenCalledWith("join");
    expect(showView).toHaveBeenCalledWith("join");
    expect(showView).not.toHaveBeenCalledWith("lobby");
  });
});
