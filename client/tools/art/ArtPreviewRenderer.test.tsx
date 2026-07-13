import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtPreviewRenderer } from "./ArtPreviewRenderer";
import type { ArtComponent, ArtComposition } from "../../types/game-data";

describe("ArtPreviewRenderer transform origins", () => {
  it("renders Shape styling as the visible artwork even when stale image fields are present", () => {
    const component = {
      id: "background",
      kind: "shape",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      shapeStyle: "circle",
      fillColor: "#fff6d8",
      borderColor: "#17131f",
      borderWidth: 6,
      imageAssetId: "avatar-frame"
    } as ArtComponent;
    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer components={[component]} compositionById={new Map()} assetUrlById={new Map([["avatar-frame", "/frame.svg"]])} />
    );
    expect(markup).toContain("border-radius:50%");
    expect(markup).toContain("background:#fff6d8");
    expect(markup).not.toContain("/frame.svg");
  });

  it("renders Original and Tinted Sprites without Shape styling", () => {
    const components = [
      { id: "original", kind: "sprite", x: 40, y: 40, width: 40, height: 40, imageAssetId: "rex", imageObjectFit: "contain", spriteRenderMode: "original" },
      { id: "tinted", kind: "sprite", x: 90, y: 40, width: 40, height: 40, imageAssetId: "rex", imageObjectFit: "contain", imageTint: "#22d3ee", spriteRenderMode: "tinted" }
    ] as ArtComponent[];
    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer components={components} compositionById={new Map()} assetUrlById={new Map([["rex", "/rex.svg"]])} />
    );
    expect(markup).toContain("background-image:url(/rex.svg)");
    expect(markup).toContain("mask-image:url(/rex.svg)");
    expect(markup).toContain("background:#22d3ee");
    expect(markup).toContain("border-radius:0");
  });

  it("renders the persisted nine-point origin and its selected drag handle", () => {
    const component = {
      id: "card",
      name: "Card",
      kind: "shape",
      x: 50,
      y: 50,
      width: 100,
      height: 60,
      transformOrigin: "bottomRight"
    } as ArtComponent;

    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer
        components={[component]}
        compositionById={new Map()}
        interactive
        selectedIds={new Set(["card"])}
      />
    );

    expect(markup).toContain("transform-origin:100% 100%");
    expect(markup).toContain('data-art-transform-origin="bottomRight"');
  });

  it("hides editor-hidden components without changing their runtime visible property", () => {
    const component = {
      id: "card",
      name: "Card",
      kind: "shape",
      x: 50,
      y: 50,
      width: 100,
      height: 60,
      visible: true,
      editorHidden: true
    } as ArtComponent;

    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer components={[component]} compositionById={new Map()} interactive />
    );

    expect(markup).toContain("visibility:hidden");
    expect(component.visible).toBe(true);
  });

  it("keeps locked components visible while removing preview pointer interaction", () => {
    const component = {
      id: "card",
      name: "Card",
      kind: "shape",
      x: 50,
      y: 50,
      width: 100,
      height: 60,
      locked: true,
      editorHidden: false
    } as ArtComponent;

    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer components={[component]} compositionById={new Map()} interactive />
    );

    expect(markup).toContain("visibility:visible");
    expect(markup).toContain("pointer-events:none");
    expect(markup).toContain('data-art-component-locked="true"');
  });

  it("normalizes referenced artwork to its tight visual bounds", () => {
    const vip = {
      id: "player-vip-widget",
      name: "Player VIP Widget",
      surface: "stage",
      canvas: { width: 52, height: 28 },
      components: [{ id: "card", name: "VIP Card", kind: "shape", x: 22, y: 11, width: 44, height: 22 }]
    } as ArtComposition;
    const reference = {
      id: "vip-reference",
      name: "Player VIP Widget",
      kind: "reference",
      artCompositionId: vip.id,
      x: 22,
      y: 11,
      width: 44,
      height: 22
    } as ArtComponent;

    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer components={[reference]} compositionById={new Map([[vip.id, vip]])} />
    );

    expect(markup).toContain("scale(1, 1) translate(0px, 0px)");
  });

  it("renders live positions for every component in a group drag", () => {
    const components = [
      { id: "vip", name: "VIP", kind: "shape", x: 10, y: 10, width: 20, height: 20 },
      { id: "bubble", name: "Bubble", kind: "shape", x: 20, y: 20, width: 20, height: 20 }
    ] as ArtComponent[];

    const markup = renderToStaticMarkup(
      <ArtPreviewRenderer
        components={components}
        compositionById={new Map()}
        livePositions={{ vip: { x: 100, y: 110 }, bubble: { x: 200, y: 210 } }}
      />
    );

    expect(markup).toContain("left:90px;top:100px");
    expect(markup).toContain("left:190px;top:200px");
  });
});
