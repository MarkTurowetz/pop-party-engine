import { describe, expect, it, vi } from "vitest";
import { PartyGameGameObject } from "./gameObject";

describe("PartyGameGameObject (ported game-object)", () => {
  it("defaultVisibleFor maps animation states to visibility", () => {
    const { defaultAnimationFor, defaultVisibleFor } = PartyGameGameObject;
    expect(defaultVisibleFor({ defaultAnimationState: "on" })).toBe(true);
    expect(defaultVisibleFor({ defaultAnimationState: "appear" })).toBe(true);
    expect(defaultVisibleFor({ defaultAnimationState: "off" })).toBe(false);
    expect(defaultVisibleFor({ defaultAnimationState: "hidden" })).toBe(false);
    expect(defaultVisibleFor({ hidden: true, defaultAnimationState: "on" })).toBe(false);
    expect(defaultVisibleFor({ element: { hidden: true }, defaultAnimationState: "on" })).toBe(false);
    expect(defaultVisibleFor({ isDynamic: true, isArt: true })).toBe(false);
    expect(defaultVisibleFor({})).toBe(null);
    expect(defaultAnimationFor({ defaultAnimationState: "Park" })).toBe("Off");
    expect(defaultAnimationFor({ isArt: true })).toBe("Off");
  });

  it("applies authored defaults by explicitly playing their timeline label", () => {
    const object = PartyGameGameObject.create({ id: "art", target: {} as HTMLElement, defaultAnimationState: "Park" });
    const playAnimation = vi.spyOn(object, "playAnimation").mockReturnValue(0);

    expect(object.applyDefaultVisibility()).toBe(true);
    expect(playAnimation).toHaveBeenCalledWith("Off", { instant: true });
  });

  it("registry registers, reuses, and removes by id", () => {
    const registry = PartyGameGameObject.createRegistry();
    registry.beginFrame();
    const first = registry.register({ id: "alpha" });
    const again = registry.register({ id: "alpha" });
    expect(again).toBe(first);
    expect(registry.get("alpha")).toBe(first);
    registry.remove("alpha");
    expect(registry.get("alpha")).toBe(null);
  });

  it("register without an id returns a throwaway object not held by the registry", () => {
    const registry = PartyGameGameObject.createRegistry();
    registry.beginFrame();
    const object = registry.register({});
    expect(object).toBeInstanceOf(PartyGameGameObject.GameObject);
    expect(registry.objects.size).toBe(0);
  });

  it("a game object with no target reports not visible and plays nothing", () => {
    const object = PartyGameGameObject.create({ id: "x" });
    expect(object.isVisible()).toBe(false);
    expect(object.playVisibility(true)).toBe(0);
  });

  it("plays arbitrary named animations on attached art renderers", () => {
    const playAll = vi.fn(() => 480);
    const object = PartyGameGameObject.create({ id: "animated", artRenderer: { playAll } });
    expect(object.playAnimation("pop", { instant: true })).toBe(480);
    expect(playAll).toHaveBeenCalledWith("pop", { instant: true });
  });

  it("sends visibility lifecycle calls to the authored art timeline", () => {
    const playAll = vi.fn(() => 480);
    const play = vi.fn(() => 320);
    const object = PartyGameGameObject.create({
      id: "animated",
      target: {} as HTMLElement,
      artRenderer: { playAll },
      syncArtRendererOnShow: true
    });
    vi.spyOn(object, "createVisual").mockReturnValue({ isVisible: () => false, play } as never);

    expect(object.playVisibility(true)).toBe(480);
    expect(playAll).toHaveBeenCalledWith("appear", {});
    expect(play).toHaveBeenCalledWith("appear", {});
  });
});
