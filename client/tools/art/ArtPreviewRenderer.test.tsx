import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArtPreviewRenderer } from "./ArtPreviewRenderer";
import type { ArtComponent } from "../../types/game-data";

describe("ArtPreviewRenderer transform origins", () => {
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
});
