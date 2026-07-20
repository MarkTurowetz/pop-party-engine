import { describe, expect, it, vi } from "vitest";
import { createControllerAvatarView, type ControllerAvatarViewOptions } from "./controllerAvatarView";

function options(overrides: Partial<ControllerAvatarViewOptions> = {}): ControllerAvatarViewOptions {
  return {
    avatarClass: () => "shape",
    avatarComposites: [],
    avatarFrameImage: () => "",
    avatarLabel: () => "",
    dinoIcon: () => "",
    elements: {} as Record<string, HTMLElement>,
    getControllerState: () => null,
    renderState: vi.fn(),
    setControllerPlayer: vi.fn(),
    setMetaText: vi.fn(),
    updateAvatar: vi.fn(async () => ({})),
    ...overrides
  };
}

describe("createControllerAvatarView (ported)", () => {
  it("starts closed and exposes the view methods", () => {
    const view = createControllerAvatarView(options());
    expect(view.isOpen()).toBe(false);
    expect(view.open).toBeTypeOf("function");
    expect(view.setAvatar).toBeTypeOf("function");
  });

  it("open is a no-op without a controller player (no DOM touched)", () => {
    const view = createControllerAvatarView(options({ getControllerState: () => ({}) }));
    expect(() => view.open()).not.toThrow();
    expect(view.isOpen()).toBe(false);
  });

  it("close before open resolves without committing", async () => {
    const updateAvatar = vi.fn(async () => ({}));
    const view = createControllerAvatarView(options({ updateAvatar }));
    await view.close();
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("delegates Player Banner content to the authored compound widget", () => {
    const banner = {} as HTMLElement;
    const setBannerArt = vi.fn();
    const player = { name: "Ava", avatar: { shape: "stego", color: "#22d3ee" } };
    const view = createControllerAvatarView(options({
      elements: { banner } as Record<string, HTMLElement>,
      setBannerArt
    }));

    view.setBanner(player);

    expect(setBannerArt).toHaveBeenCalledWith(banner, player);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerAvatarView?: unknown };
    expect(host.createControllerAvatarView).toBeTypeOf("function");
  });
});
