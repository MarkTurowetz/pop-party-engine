import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutToolApp } from "./LayoutToolApp";

describe("LayoutToolApp shell", () => {
  it("renders a hidden legacy bridge shell with layout metadata", () => {
    const markup = renderToStaticMarkup(
      <LayoutToolApp
        layouts={{
          canvas: { width: 1920, height: 1080 },
          global: { id: "global", name: "Global", elements: [{ id: "logo", name: "Logo", kind: "art" }] },
          states: [{ id: "intro", name: "Intro", elements: [] }]
        }}
        selectedElementIds={["logo"]}
        selectedStateId="global"
        visible={true}
      />
    );

    expect(markup).toContain('data-layout-react-shell="legacy-bridge"');
    expect(markup).toContain('data-layout-group-count="2"');
    expect(markup).toContain('data-layout-selected-count="1"');
    expect(markup).toContain('data-layout-react-component="group-list"');
    expect(markup).toContain('data-layout-react-component="element-list"');
    expect(markup).toContain("1920 x 1080");
  });
});
