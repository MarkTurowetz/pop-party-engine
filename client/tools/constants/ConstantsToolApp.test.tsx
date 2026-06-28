import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConstantsToolApp } from "./ConstantsToolApp";

describe("ConstantsToolApp shell", () => {
  it("renders a hidden legacy bridge shell with constants metadata", () => {
    const markup = renderToStaticMarkup(
      <ConstantsToolApp
        constants={{
          gameTitle: "Party",
          playerColors: ["#fff"],
          customConstants: [{ id: "roundName", name: "Round Name", type: "string", value: "Intro" }],
          numberOfRounds: 3,
          craftingTimerDuration: 30,
          pointsForCorrectAnswer: 200
        }}
        selectedConstantId="constant:roundName"
        visible={true}
      />
    );

    expect(markup).toContain('data-constants-react-shell="legacy-bridge"');
    expect(markup).toContain('data-player-color-count="1"');
    expect(markup).toContain('data-custom-constant-count="1"');
    expect(markup).toContain("Round Name");
  });
});
