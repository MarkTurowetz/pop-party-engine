import { describe, expect, it, vi } from "vitest";
import { artComponentBoundsInComposition, PartyGameStageWidgetArt } from "./stageWidgetArtRenderer";

describe("PartyGameStageWidgetArt (ported widget-art-renderer)", () => {
  it("createRenderer returns the render surface", () => {
    const renderer = PartyGameStageWidgetArt.createRenderer({});
    expect(renderer.render).toBeTypeOf("function");
    expect(renderer.renderBound).toBeTypeOf("function");
    expect(renderer.positionOverlay).toBeTypeOf("function");
  });

  it("render returns null without a host", () => {
    const renderer = PartyGameStageWidgetArt.createRenderer({ getComposition: () => ({ components: [] }) });
    expect(renderer.render(null, "any")).toBe(null);
  });

  it("updates nested widget text without replaying lifecycle state", () => {
    const playAll = vi.fn();
    let runtimeGetComposition: ((id: string) => Record<string, unknown> | null) | undefined;
    class FakeTreeRenderer {
      playAll = playAll;
      render = vi.fn();
      constructor(options: { getComposition?: (id: string) => Record<string, unknown> | null }) {
        runtimeGetComposition = options.getComposition;
      }
    }
    const makeClassList = (owner: { className?: string }) => ({
      add: (...names: string[]) => {
        owner.className = [...new Set([...(owner.className || "").split(/\s+/).filter(Boolean), ...names])].join(" ");
      },
      contains: (name: string) => (owner.className || "").split(/\s+/).includes(name)
    });
    const host = {
      id: "craftingTimer",
      className: "crafting-timer",
      children: [] as Array<Record<string, unknown>>,
      childNodes: [] as Array<Record<string, unknown>>,
      dataset: { visualState: "appearing" },
      prepend(child: Record<string, unknown>) {
        this.children.unshift(child);
        this.childNodes.unshift(child);
      }
    };
    (host as Record<string, unknown>).classList = makeClassList(host);
    const documentRef = {
      createElement: () => {
        const element: { className: string; classList?: ReturnType<typeof makeClassList> } = { className: "" };
        element.classList = makeClassList(element);
        return element;
      }
    };
    const compositions: Record<string, Record<string, unknown>> = {
      widget: {
        canvas: { width: 180, height: 180 },
        components: [{ id: "timer-reference", kind: "reference", artCompositionId: "base" }],
        timeline: { fps: 30, frameCount: 2, labels: [{ name: "Off", frame: 0 }], commands: [{ frame: 0, type: "stop" }], tracks: [] }
      },
      base: {
        canvas: { width: 180, height: 180 },
        components: [{ id: "timer-value", kind: "text", defaultText: "30" }]
      }
    };
    const globals = globalThis as unknown as Record<string, unknown>;
    const previousNode = globals.Node;
    const previousArtObject = globals.PartyGameArtObject;
    globals.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
    globals.PartyGameArtObject = { ArtObjectTreeRenderer: FakeTreeRenderer };
    try {
      const renderer = PartyGameStageWidgetArt.createRenderer({
        document: documentRef,
        getComposition: (id: string) => compositions[id] || null
      });
      renderer.renderBound(host as unknown as HTMLElement, {
        compositionId: "widget",
        textOverrides: (context: Record<string, unknown>) => ({ "timer-value": context.label })
      }, { label: "29" });

      expect(playAll).not.toHaveBeenCalled();
      expect(PartyGameStageWidgetArt.rendererForHost(host as unknown as HTMLElement))
        .toBeInstanceOf(FakeTreeRenderer);
      expect(runtimeGetComposition?.("base")).toMatchObject({
        components: [expect.objectContaining({ id: "timer-value", defaultText: "29" })]
      });
    } finally {
      globals.Node = previousNode;
      globals.PartyGameArtObject = previousArtObject;
    }
  });

  it("resolves overlay bounds through a nested lobby widget prefab", () => {
    const compositions: Record<string, Record<string, unknown>> = {
      parent: {
        id: "parent",
        canvas: { width: 260, height: 300 },
        components: [{
          id: "join-qr-code-art",
          kind: "reference",
          artCompositionId: "child",
          x: 130,
          y: 150,
          width: 1,
          height: 1,
          scale: 1
        }]
      },
      child: {
        id: "child",
        canvas: { width: 260, height: 300 },
        components: [{ id: "qr-placeholder", kind: "shape", x: 130, y: 124, width: 212, height: 212, scale: 1 }]
      }
    };

    expect(artComponentBoundsInComposition(
      compositions.parent,
      "qr-placeholder",
      (id) => compositions[id] || null
    )).toEqual({ x: 130, y: 124, width: 212, height: 212 });
  });

  it("tracks child canvas changes instead of stale parent reference dimensions", () => {
    const compositions: Record<string, Record<string, unknown>> = {
      parent: {
        id: "parent",
        canvas: { width: 520, height: 600 },
        components: [{
          id: "join-qr-code-art",
          kind: "reference",
          artCompositionId: "child",
          x: 260,
          y: 300,
          width: 1,
          height: 1,
          scale: 2
        }]
      },
      child: {
        id: "child",
        canvas: { width: 260, height: 300 },
        components: [{
          id: "qr-placeholder",
          kind: "shape",
          x: 130,
          y: 124,
          width: 212,
          height: 212,
          scale: 1
        }]
      }
    };

    expect(artComponentBoundsInComposition(
      compositions.parent,
      "qr-placeholder",
      (id) => compositions[id] || null
    )).toEqual({ x: 260, y: 248, width: 424, height: 424 });
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageWidgetArt?: unknown };
    expect(host.PartyGameStageWidgetArt).toBeTypeOf("object");
  });
});
