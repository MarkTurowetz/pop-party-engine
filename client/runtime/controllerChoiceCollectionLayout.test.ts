import { describe, expect, it } from "vitest";
import {
  choiceCollectionItemDimensions,
  choiceCollectionLayoutStyle
} from "./controllerChoiceCollectionLayout";

describe("controller choice collection layout", () => {
  it("maps authored collection geometry to deterministic flex styles", () => {
    expect(choiceCollectionLayoutStyle({
      collectionDirection: "horizontal",
      collectionGap: 12,
      collectionDistribution: "space-between",
      collectionAlignment: "center",
      collectionPadding: 8,
      collectionOverflow: "scroll"
    })).toEqual({
      alignItems: "center",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "row",
      gap: "12px",
      justifyContent: "space-between",
      overflow: "scroll",
      padding: "8px"
    });
  });

  it("stretches only the cross axis so authored item proportions remain authoritative", () => {
    expect(choiceCollectionItemDimensions(
      { width: 330, height: 500, collectionDirection: "vertical", collectionAlignment: "stretch", collectionPadding: 15 },
      { canvas: { width: 240, height: 80 } }
    )).toEqual({ width: 300, height: 80 });
    expect(choiceCollectionItemDimensions(
      { width: 500, height: 150, collectionDirection: "horizontal", collectionAlignment: "stretch", collectionPadding: 10 },
      { canvas: { width: 120, height: 80 } }
    )).toEqual({ width: 120, height: 130 });
  });
});
