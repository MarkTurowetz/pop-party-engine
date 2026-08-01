import { describe, expect, it, vi } from "vitest";
import { PartyGameLayoutGameObjects } from "./layoutGameObjectRuntime";

describe("PartyGameLayoutGameObjects (ported layout-game-object-runtime)", () => {
  it("canonicalizes legacy booleans and named placement scopes before adapter callbacks", () => {
    const register = vi.fn((entity) => entity);
    const registryKeyFor = vi.fn((id: string, scope: string) => `${scope}:${id}`);
    const visibilityKeyFor = vi.fn((id: string, scope: string) => `${scope}:${id}`);
    const place = PartyGameLayoutGameObjects.createPlacedLayoutEntityRegistrar({
      registry: () => ({ register }),
      registryKeyFor,
      visibilityKeyFor
    });
    const target = {} as HTMLElement;

    expect(place({ id: "legacy-moment" }, target, false)).toMatchObject({
      layoutScope: "moment",
      isGlobal: false,
      registryKey: "moment:legacy-moment",
      visibilityKey: "moment:legacy-moment"
    });
    expect(place({ id: "legacy-global" }, target, true)).toMatchObject({
      layoutScope: "global",
      isGlobal: true,
      registryKey: "global:legacy-global",
      visibilityKey: "global:legacy-global"
    });
    expect(place({ id: "active" }, target, "state:lobby")).toMatchObject({
      layoutScope: "state:lobby",
      registryKey: "state:lobby:active"
    });
    expect(place({ id: "context" }, target, "layer:round-context")).toMatchObject({
      layoutScope: "layer:round-context",
      registryKey: "layer:round-context:context"
    });
    expect(registryKeyFor.mock.calls.every(([, scope]) => typeof scope === "string")).toBe(true);
    expect(visibilityKeyFor.mock.calls.every(([, scope]) => typeof scope === "string")).toBe(true);
  });

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

  it("initializes lifecycle objects from their authored default without applying a structural fallback", () => {
    const applyDefaultVisibility = vi.fn(() => true);
    const applyTargetVisibility = vi.fn();

    expect(PartyGameLayoutGameObjects.initializeLayoutEntity({
      applyDefaultVisibility,
      applyTargetVisibility
    }, { fallbackVisible: true })).toBe(true);
    expect(applyDefaultVisibility).toHaveBeenCalledOnce();
    expect(applyTargetVisibility).not.toHaveBeenCalled();
  });

  it("initializes structural layout hosts from their authored hidden flag fallback", () => {
    const applyDefaultVisibility = vi.fn(() => false);
    const applyTargetVisibility = vi.fn();

    expect(PartyGameLayoutGameObjects.initializeLayoutEntity({
      applyDefaultVisibility,
      applyTargetVisibility
    }, { fallbackVisible: false })).toBe(true);
    expect(applyDefaultVisibility).toHaveBeenCalledOnce();
    expect(applyTargetVisibility).toHaveBeenCalledWith(false);
  });

  it("does not restart visibility animations when a placed entity already matches the requested state", () => {
    const visualPlay = vi.fn(() => 0);
    const playVisibility = vi.fn(() => 300);
    const complete = vi.fn();
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
      expect(resolver.setShownForAction(
        { commandSource: "flow-action", targetLayoutElementId: "player-roster", isShown: true, instant: false },
        { complete }
      )).toBe(0);
      expect(playVisibility).not.toHaveBeenCalled();
      expect(visualPlay).not.toHaveBeenCalled();
      expect(complete).toHaveBeenCalledOnce();
    } finally {
      globals.PartyGameVisualObject = previousVisualRuntime;
    }
  });

  it("exposes the layout game-object helpers", () => {
    expect(PartyGameLayoutGameObjects.activeDynamicLayoutArtInstanceIds).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.initializeLayoutEntity).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.playLayoutEntityAnimationForAction).toBeTypeOf("function");
    expect(PartyGameLayoutGameObjects.setLayoutGameObjectShownForAction).toBeTypeOf("function");
  });

  it("does not promote a matching DOM node into an unauthored layout entity", () => {
    const target = {} as HTMLElement;
    const register = vi.fn();
    const resolver = PartyGameLayoutGameObjects.createPlacedLayoutGameObjectTargetResolver({
      registry: () => ({ get: () => null, register }),
      targetByElementId: () => target,
      visibilityKeyForTarget: () => "moment:legacy-node"
    });

    expect(resolver.entityForElementId("legacy-node", target, "moment")).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("applies text and style overrides to a scoped text component inside a referenced prefab", () => {
    const options = {
      textOverrides: {
        "layout-text-field/text": "",
        "prefab-layout-text-field-text/text": "Party Game Template"
      },
      textStyle: {
        componentId: "prefab-layout-text-field-text/text",
        fontSize: 92,
        fontColor: "#ffffff"
      }
    };
    const legacyText = PartyGameLayoutGameObjects.cloneLayoutArtComponent(
      { id: "text", kind: "text", defaultText: "LEGACY" },
      options,
      "layout-text-field"
    );
    const nestedText = PartyGameLayoutGameObjects.cloneLayoutArtComponent(
      { id: "generated-text-id", instanceLabel: "text", kind: "text", defaultText: "TEXT" },
      options,
      "prefab-layout-text-field-text"
    );

    expect(legacyText.defaultText).toBe("");
    expect(nestedText).toMatchObject({
      defaultText: "Party Game Template",
      fontSize: 92,
      fontColor: "#ffffff",
      autoFitText: false
    });
  });

  it("applies data overrides to the deepest scoped component without replacing authored children", () => {
    const component = PartyGameLayoutGameObjects.cloneLayoutArtComponent(
      {
        id: "avatar",
        kind: "sprite",
        imageTint: "currentColor",
        children: [{ id: "mask", kind: "shape", fillColor: "#ffffff" }]
      },
      {
        componentOverrides: {
          "avatars/avatar": { imageTint: "#ff4fa3", children: [] }
        }
      },
      "avatars"
    );

    expect(component).toMatchObject({ imageTint: "#ff4fa3" });
    expect(component.children).toEqual([{ id: "mask", kind: "shape", fillColor: "#ffffff", children: [] }]);
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

      const retainedLayer = root.querySelector(".controller-widget-art-layer");
      api.render({ id: "test", artCompositionId: "controller-primary-button" }, root as unknown as HTMLElement, "test", {
        keepElements: [overlay as unknown as HTMLElement],
        textOverrides: { text: "Reconciled while disappearing" }
      });
      expect(renderCalls.length).toBe(2);
      expect(root.querySelector(".controller-widget-art-layer")).toBe(retainedLayer);
    } finally {
      globals.document = previousDocument;
      host.artComposition = previousComposition;
      host.PartyGameArtObject = previousArtObject;
    }
  });
});
