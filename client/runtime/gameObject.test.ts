import { describe, expect, it, vi } from "vitest";
import { PartyGameGameObject } from "./gameObject";

describe("PartyGameGameObject (ported game-object)", () => {
  it("defaultVisibleFor maps animation states to visibility", () => {
    const { defaultVisibleFor } = PartyGameGameObject;
    expect(defaultVisibleFor({ defaultAnimationState: "on" })).toBe(true);
    expect(defaultVisibleFor({ defaultAnimationState: "appear" })).toBe(true);
    expect(defaultVisibleFor({ defaultAnimationState: "off" })).toBe(false);
    expect(defaultVisibleFor({ defaultAnimationState: "hidden" })).toBe(false);
    expect(defaultVisibleFor({ hidden: true, defaultAnimationState: "on" })).toBe(false);
    expect(defaultVisibleFor({ element: { hidden: true }, defaultAnimationState: "on" })).toBe(false);
    expect(defaultVisibleFor({ isDynamic: true, isArt: true })).toBe(false);
    expect(defaultVisibleFor({})).toBe(null);
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
});
