type Dict = Record<string, unknown>;

export type ChoiceCollectionDirection = "horizontal" | "vertical";

export interface ChoiceCollectionLayoutStyle {
  alignItems: "flex-start" | "center" | "flex-end" | "stretch";
  boxSizing: "border-box";
  display: "flex";
  flexDirection: "row" | "column";
  gap: string;
  justifyContent:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  overflow: "visible" | "hidden" | "auto" | "scroll";
  padding: string;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

export function choiceCollectionDirection(element: Dict): ChoiceCollectionDirection {
  return String(element.collectionDirection || "vertical").toLowerCase() === "horizontal"
    ? "horizontal"
    : "vertical";
}

export function choiceCollectionLayoutStyle(element: Dict): ChoiceCollectionLayoutStyle {
  const direction = choiceCollectionDirection(element);
  const distribution = String(element.collectionDistribution || "start").toLowerCase();
  const alignment = String(element.collectionAlignment || "stretch").toLowerCase();
  const overflow = String(element.collectionOverflow || "auto").toLowerCase();
  const justifyContent = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    "space-between": "space-between",
    "space-around": "space-around",
    "space-evenly": "space-evenly"
  }[distribution] || "flex-start";
  const alignItems = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch"
  }[alignment] || "stretch";
  return {
    display: "flex",
    flexDirection: direction === "horizontal" ? "row" : "column",
    gap: `${boundedNumber(element.collectionGap, 16, 0, 500)}px`,
    justifyContent: justifyContent as ChoiceCollectionLayoutStyle["justifyContent"],
    alignItems: alignItems as ChoiceCollectionLayoutStyle["alignItems"],
    padding: `${boundedNumber(element.collectionPadding, 0, 0, 500)}px`,
    overflow: ["visible", "hidden", "auto", "scroll"].includes(overflow)
      ? overflow as ChoiceCollectionLayoutStyle["overflow"]
      : "auto",
    boxSizing: "border-box"
  };
}

export function choiceCollectionItemDimensions(
  element: Dict,
  composition: Dict,
  itemCount = 1
): { width: number; height: number } {
  const direction = choiceCollectionDirection(element);
  const alignment = String(element.collectionAlignment || "stretch").toLowerCase();
  const padding = boundedNumber(element.collectionPadding, 0, 0, 500);
  const canvas = (composition.canvas as Dict | undefined) || {};
  let width = Math.max(1, Number(canvas.width || 1));
  let height = Math.max(1, Number(canvas.height || 1));
  if (alignment === "stretch") {
    if (direction === "vertical") width = Math.max(1, Number(element.width || width) - padding * 2);
    else height = Math.max(1, Number(element.height || height) - padding * 2);
  }
  void itemCount;
  return { width, height };
}
