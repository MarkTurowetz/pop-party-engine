import { describe, expect, it, vi } from "vitest";
import { PartyGameLayoutGameObjects } from "./layoutGameObjectRuntime";

describe("PartyGameLayoutGameObjects (ported layout-game-object-runtime)", () => {
  it("activates an active-layout entity by silently applying its authored setup state", () => {
    const applyVisibilityState = vi.fn();
    const playAnimation = vi.fn(() => 125);
    const entity = { applyVisibilityState, playAnimation, visibilityKey: "crafting:choice-grid" };

    expect(PartyGameLayoutGameObjects.activateLayoutEntity(entity)).toBe(0);
    expect(applyVisibilityState).toHaveBeenCalledOnce();
    expect(playAnimation).not.toHaveBeenCalled();
  });

  it("does not replay a saved visibility override during reconciliation", () => {
    const applyVisibilityState = vi.fn();
    const playAnimation = vi.fn();
    const entity = { applyVisibilityState, playAnimation, visibilityKey: "crafting:choice-grid" };

    expect(
      PartyGameLayoutGameObjects.activateLayoutEntity(entity, {
        visibilityOverrides: new Map([["crafting:choice-grid", false]])
      })
    ).toBe(0);
    expect(applyVisibilityState).toHaveBeenCalledOnce();
    expect(playAnimation).not.toHaveBeenCalled();
  });

  it("deactivates removed layout entities immediately without issuing a timeline command", () => {
    const applyTargetVisibility = vi.fn();
    const playAnimation = vi.fn(() => 0);

    expect(PartyGameLayoutGameObjects.deactivateLayoutEntity({ applyTargetVisibility, playAnimation })).toBe(0);
    expect(applyTargetVisibility).toHaveBeenCalledWith(false);
    expect(playAnimation).not.toHaveBeenCalled();
  });

  it("does not restart visibility animations when a placed entity already matches the requested state", () => {
    const visualPlay = vi.fn(() => 0);
    const playVisibility = vi.fn(() => 300);
    const target = { dataset: { visualState: "shown" } } as unknown as HTMLElement;
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({
        get: () => ({
          id: "player-roster",
          target,
          visibilityKey: "global:player-roster",
          createVisual: () => ({ play: visualPlay }),
          playVisibility
        })
      }),
      visibilityKeyForTarget: () => "global:player-roster",
      visibilityOverrides: new Map<string, boolean>()
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousVisualRuntime = globals.PartyGameVisualObject;
    globals.PartyGameVisualObject = {};
    try {
      expect(resolver.setShownForAction({ commandSource: "flow-action", targetLayoutElementId: "player-roster", isShown: true, instant: false })).toBe(0);
      expect(playVisibility).not.toHaveBeenCalled();
      expect(visualPlay).toHaveBeenCalledWith("On", { instant: true });
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("exposes the layout game-object helpers", () => {
    expect(PartyGameLayoutGameObjects.activeDynamicLayoutArtInstanceIds).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.playLayoutEntityAnimationForAction).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.setLayoutGameObjectShownForAction).toBeTypeOf("function");
  });

  it("activeDynamicLayoutArtInstanceIds collects dynamic state + non-hidden global ids", () => {
    const isDynamic = (el: { dynamic?: boolean }) => el.dynamic === true;
    const ids = PartyGameLayoutGameObjects.activeDynamicLayoutArtInstanceIds(
      { elements: [{ id: "a", dynamic: true }, { id: "b" }], hiddenGlobals: ["g2"] },
      { elements: [{ id: "g1", dynamic: true }, { id: "g2", dynamic: true }], hiddenInStates: false },
      isDynamic as never
    );
    expect([...ids].sort()).toEqual(["a", "g1"]);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameLayoutGameObjects?: unknown };
    expect(host.PartyGameLayoutGameObjects).toBeTypeOf("object");
  });

  it("attaches a rendered art tree without replaying lifecycle state", () => {
    const renderer = { playAll: vi.fn() };
    const entity = {
      update: vi.fn(function (this: Record<string, unknown>, patch: Record<string, unknown>) {
        Object.assign(this, patch);
      }),
      applyVisibilityState: vi.fn()
    };

    expect(PartyGameLayoutGameObjects.attachRenderedLayoutArtEntity(entity, () => renderer)).toBe(renderer);
    expect(entity.update).toHaveBeenCalledWith({ artRenderer: renderer, syncArtRendererOnShow: true });
    expect(entity.applyVisibilityState).not.toHaveBeenCalled();
  });

  it("preserves a retained art entity timeline instead of reapplying its default state", () => {
    const renderer = { playAll: vi.fn() };
    const entity = {
      update: vi.fn(),
      applyVisibilityState: vi.fn()
    };

    expect(
      PartyGameLayoutGameObjects.attachRenderedLayoutArtEntity(entity, () => renderer, { initializeVisibility: false })
    ).toBe(renderer);
    expect(entity.update).toHaveBeenCalledWith({ artRenderer: renderer, syncArtRendererOnShow: true });
    expect(entity.applyVisibilityState).not.toHaveBeenCalled();
  });

  it("plays named animations through placed layout target resolvers", () => {
    const target = {} as HTMLElement;
    const playAnimation = vi.fn(() => 360);
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({
        get: () => ({ id: "answer-bubble", target, playAnimation, visibilityKey: "moment:answer-bubble" })
      }),
      visibilityKeyForTarget: () => "moment:answer-bubble"
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousVisualRuntime = globals.PartyGameVisualObject;
    globals.PartyGameVisualObject = {};
    try {
      const result = resolver.playAnimationForAction(
        { commandSource: "flow-action", targetLayoutElementId: "answer-bubble", animationName: "pop" },
        { returnResult: true }
      );
      expect(result).toEqual({ duration: 360, missing: false, reason: "" });
      expect(playAnimation).toHaveBeenCalledWith("pop", { instant: false });
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("stops placed layout targets at named timeline labels", () => {
    const target = {} as HTMLElement;
    const stopAtAnimation = vi.fn(() => 0);
    const playAnimation = vi.fn(() => 360);
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({
        get: () => ({ id: "avatar", target, playAnimation, stopAtAnimation, visibilityKey: "moment:avatar" })
      }),
      visibilityKeyForTarget: () => "moment:avatar"
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousVisualRuntime = globals.PartyGameVisualObject;
    globals.PartyGameVisualObject = {};
    try {
      const result = resolver.playAnimationForAction(
        { commandSource: "flow-action", type: "stopGameObjectAnimation", targetLayoutElementId: "avatar", animationName: "stego", timelinePlaybackMode: "stop", instant: true },
        { returnResult: true }
      );
      expect(result).toEqual({ duration: 0, missing: false, reason: "" });
      expect(stopAtAnimation).toHaveBeenCalledWith("stego", { instant: true });
      expect(playAnimation).not.toHaveBeenCalled();
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("plays named animations on nested art components through placed layout targets", () => {
    const target = {} as HTMLElement;
    const playComponent = vi.fn(() => 180);
    const playAnimation = vi.fn(() => 360);
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({
        get: () => ({
          id: "answer-bubble",
          target,
          playAnimation,
          artRenderer: { playComponent },
          visibilityKey: "moment:answer-bubble"
        })
      }),
      visibilityKeyForTarget: () => "moment:answer-bubble"
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousVisualRuntime = globals.PartyGameVisualObject;
    globals.PartyGameVisualObject = {};
    try {
      const result = resolver.playAnimationForAction(
        {
          commandSource: "flow-action",
          targetLayoutElementId: "answer-bubble",
          targetComponentId: "answer-text",
          animationName: "text-pop"
        },
        { returnResult: true }
      );
      expect(result).toEqual({ duration: 180, missing: false, reason: "" });
      expect(playComponent).toHaveBeenCalledWith("answer-text", "text-pop", { instant: false });
      expect(playAnimation).not.toHaveBeenCalled();
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("passes scoped nested component animation targets through placed layout targets", () => {
    const target = {} as HTMLElement;
    const playComponent = vi.fn(() => 180);
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({
        get: () => ({
          id: "player",
          target,
          artRenderer: { playComponent },
          visibilityKey: "moment:player"
        })
      }),
      visibilityKeyForTarget: () => "moment:player"
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousVisualRuntime = globals.PartyGameVisualObject;
    globals.PartyGameVisualObject = {};
    try {
      const result = resolver.playAnimationForAction(
        {
          commandSource: "flow-action",
          targetLayoutElementId: "player",
          targetComponentId: "answer-bubble-slot/answer-text",
          animationName: "pulse"
        },
        { returnResult: true }
      );
      expect(result).toEqual({ duration: 180, missing: false, reason: "" });
      expect(playComponent).toHaveBeenCalledWith("answer-bubble-slot/answer-text", "pulse", { instant: false });
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("stops nested art components at named timeline labels through placed layout targets", () => {
    const target = {} as HTMLElement;
    const stopAtComponent = vi.fn(() => 0);
    const playComponent = vi.fn(() => 180);
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({
        get: () => ({
          id: "avatar",
          target,
          artRenderer: { playComponent, stopAtComponent },
          visibilityKey: "moment:avatar"
        })
      }),
      visibilityKeyForTarget: () => "moment:avatar"
    });
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousVisualRuntime = globals.PartyGameVisualObject;
    globals.PartyGameVisualObject = {};
    try {
      const result = resolver.playAnimationForAction(
        {
          commandSource: "flow-action",
          type: "stopGameObjectAnimation",
          targetLayoutElementId: "avatar",
          targetComponentId: "dino-mask",
          animationName: "stego",
          timelinePlaybackMode: "stop"
        },
        { returnResult: true }
      );
      expect(result).toEqual({ duration: 0, missing: false, reason: "" });
      expect(stopAtComponent).toHaveBeenCalledWith("dino-mask", "stego", { instant: false });
      expect(playComponent).not.toHaveBeenCalled();
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("reconciles labeled layout text without removing overlays or restarting retained lifecycle timelines", () => {
    class FakeElement {
      childNodes: FakeElement[] = [];
      dataset: Record<string, string> = {};
      hidden = false;
      nodeType = 1;
      nodeValue: string | null = null;
      private classNames = new Set<string>();
      readonly classList = {
        add: (...names: string[]) => names.forEach((name) => this.classNames.add(name)),
        contains: (name: string) => this.classNames.has(name),
        remove: (...names: string[]) => names.forEach((name) => this.classNames.delete(name))
      };
      get children() {
        return this.childNodes;
      }
      set className(value: string) {
        this.classNames = new Set(value.split(/\s+/).filter(Boolean));
      }
      get className() {
        return [...this.classNames].join(" ");
      }
      appendChild(child: FakeElement) {
        this.childNodes.push(child);
        return child;
      }
      contains(child: FakeElement) {
        return this.childNodes.includes(child);
      }
      prepend(child: FakeElement) {
        this.childNodes.unshift(child);
      }
      querySelector(selector: string) {
        const className = selector.startsWith(".") ? selector.slice(1) : "";
        return this.childNodes.find((child) => child.classList.contains(className)) || null;
      }
    }
    const fakeDocument = { createElement: () => new FakeElement() };
    const root = new FakeElement();
    const overlay = new FakeElement();
    root.appendChild(overlay);
    const renderCalls: unknown[] = [];
    const playCalls: unknown[] = [];
    const host = globalThis as typeof globalThis & {
      artComposition?: (id: string) => unknown;
      PartyGameArtObject?: unknown;
    };
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousDocument = globals.document;
    const previousComposition = host.artComposition;
    const previousArtObject = host.PartyGameArtObject;
    globals.document = fakeDocument;
    host.artComposition = () => ({
      canvas: { width: 100, height: 50 },
      components: [
        {
          id: "root",
          kind: "container",
          children: [{ id: "generated-text-id", instanceLabel: "text", kind: "text", defaultText: "Original" }]
        }
      ]
    });
    host.PartyGameArtObject = {
      ArtObjectTreeRenderer: class {
        render(...args: unknown[]) {
          renderCalls.push(args);
        }
        playAll(...args: unknown[]) {
          playCalls.push(args);
        }
        clear() {}
      }
    };

    const api = PartyGameLayoutGameObjects.createDynamicLayoutArtInstanceApi({
      root: () => root,
      selector: ".dynamic-test-art",
      className: "dynamic-test-art",
      layerClassName: "controller-widget-art-layer",
      missingDatasetKey: "missing"
    });
    try {
      api.render({ id: "test", artCompositionId: "controller-primary-button" }, root as unknown as HTMLElement, "test", {
        keepElements: [overlay as unknown as HTMLElement],
        textOverrides: { text: "Updated through label" }
      });

      expect(root.querySelector(".controller-widget-art-layer")).toBeTruthy();
      expect(root.contains(overlay)).toBe(true);
      expect(overlay.hidden).toBe(false);
      expect(renderCalls.length).toBe(1);
      expect((((renderCalls[0] as unknown[])[0] as Array<Record<string, unknown>>)[0].children as Array<Record<string, unknown>>)[0].defaultText).toBe(
        "Updated through label"
      );
      expect((renderCalls[0] as unknown[])[2]).not.toHaveProperty("defaultAnimation");
      expect((renderCalls[0] as unknown[])[2]).not.toHaveProperty("respectDefaultAnimationState");
      expect(playCalls).toEqual([]);

      root.dataset.visualState = "shown";
      api.render({ id: "test", artCompositionId: "controller-primary-button" }, root as unknown as HTMLElement, "test", {
        keepElements: [overlay as unknown as HTMLElement],
        textOverrides: { text: "Reconciled while disappearing" }
      });

      expect(renderCalls.length).toBe(2);
      expect(playCalls).toEqual([]);
    } finally {
      globals.document = previousDocument;
      host.artComposition = previousComposition;
      host.PartyGameArtObject = previousArtObject;
    }
  });
});
