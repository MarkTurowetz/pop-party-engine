import { describe, expect, it } from "vitest";
import { distributedContainerItemPositions } from "./distributedContainerLayout";

describe("distributedContainerItemPositions", () => {
  it("distributes horizontal children by their own widths around the container center", () => {
    expect(
      distributedContainerItemPositions(
        { width: 1000, height: 200 },
        [
          { width: 100, height: 40 },
          { width: 300, height: 40 },
          { width: 100, height: 40 }
        ],
        "horizontal"
      )
    ).toEqual([
      { x: 175, y: 100 },
      { x: 500, y: 100 },
      { x: 825, y: 100 }
    ]);
  });

  it("distributes vertical children by their own heights around the container center", () => {
    const positions = distributedContainerItemPositions(
      { width: 300, height: 800 },
      [
        { width: 60, height: 100 },
        { width: 60, height: 200 }
      ],
      "vertical"
    );

    expect(positions[0].x).toBe(150);
    expect(positions[0].y).toBeCloseTo(216.667);
    expect(positions[1].x).toBe(150);
    expect(positions[1].y).toBeCloseTo(533.333);
  });

  it("keeps an oversized group centered when children are wider than the container", () => {
    expect(
      distributedContainerItemPositions(
        { width: 200, height: 80 },
        [
          { width: 180, height: 40 },
          { width: 180, height: 40 }
        ],
        "horizontal"
      )
    ).toEqual([
      { x: 10, y: 40 },
      { x: 190, y: 40 }
    ]);
  });
});
