import { describe, expect, it, vi } from "vitest";
import { PartyGameLayoutGameObjects } from "./layoutGameObjectRuntime";

describe("PartyGameLayoutGameObjects (ported layout-game-object-runtime)", () => {
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
        { targetLayoutElementId: "answer-bubble", animationName: "pop" },
        { returnResult: true }
      );
      expect(result).toEqual({ duration: 360, missing: false, reason: "" });
      expect(playAnimation).toHaveBeenCalledWith("pop", { instant: false });
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

  it("renders layout art without removing preserved overlay controls", () => {
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
    const host = globalThis as typeof globalThis & {
      artComposition?: (id: string) => unknown;
      PartyGameArtObject?: unknown;
    };
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousDocument = globals.document;
    const previousComposition = host.artComposition;
    const previousArtObject = host.PartyGameArtObject;
    globals.document = fakeDocument;
    host.artComposition = () => ({ canvas: { width: 100, height: 50 }, components: [] });
    host.PartyGameArtObject = {
      ArtObjectTreeRenderer: class {
        render(...args: unknown[]) {
          renderCalls.push(args);
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
        keepElements: [overlay as unknown as HTMLElement]
      });

      expect(root.querySelector(".controller-widget-art-layer")).toBeTruthy();
      expect(root.contains(overlay)).toBe(true);
      expect(overlay.hidden).toBe(false);
      expect(renderCalls.length).toBe(1);
    } finally {
      globals.document = previousDocument;
      host.artComposition = previousComposition;
      host.PartyGameArtObject = previousArtObject;
    }
  });
});
