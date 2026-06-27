import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtToolApp } from "./ArtToolApp";

describe("ArtToolApp shell", () => {
  it("renders a hidden legacy bridge shell with art metadata", () => {
    const markup = renderToStaticMarkup(
      <ArtToolApp
        assets={[{ id: "asset", name: "Asset", currentUrl: "/asset.png", defaultUrl: "/asset.png", hasCustom: false }]}
        compositions={[{
          id: "card",
          name: "Card",
          surface: "stage",
          canvas: { width: 100, height: 100 },
          components: [{ id: "root", kind: "group", children: [{ id: "child", kind: "text" }] }]
        }]}
        selectedAssetId="asset"
        selectedCompositionId="card"
        selectedComponentIds={["child"]}
        visible={true}
      />
    );

    expect(markup).toContain('data-art-react-shell="legacy-bridge"');
    expect(markup).toContain('data-art-asset-count="1"');
    expect(markup).toContain('data-art-composition-count="1"');
    expect(markup).toContain("Card");
  });
});
