import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import { scopeTimelinePreviewOverridesToComponent } from "./artTimelinePreviewMapping";

const player = { id: "player", kind: "container" } as ArtComponent;
const bubble = { id: "bubble", kind: "container" } as ArtComponent;

describe("artTimelinePreviewMapping", () => {
  it("maps root component timeline targets to composition-scoped preview targets", () => {
    expect(
      scopeTimelinePreviewOverridesToComponent(
        {
          self: { opacity: 1 },
          player: { scale: 1.2 },
          bubble: { x: 10 },
          "bubble/answer-text": { defaultText: "Answer" },
          "player/avatar": { y: 20 }
        },
        player,
        ["player"]
    )
    ).toEqual({
      player: { opacity: 1, scale: 1.2 },
      "player/bubble": { x: 10 },
      "player/bubble/answer-text": { defaultText: "Answer" },
      "player/avatar": { y: 20 }
    });
  });

  it("maps nested component timeline targets under the selected component path", () => {
    expect(
      scopeTimelinePreviewOverridesToComponent(
        {
          self: { opacity: 1 },
          bubble: { scale: 0.8 },
          "bubble/answer-text": { fontSize: 24 },
          "answer-text": { defaultText: "Nested" },
          "player/bubble/tail": { rotation: 45 }
        },
        bubble,
        ["player", "bubble"]
    )
    ).toEqual({
      "player/bubble": { opacity: 1, scale: 0.8 },
      "player/bubble/answer-text": { fontSize: 24, defaultText: "Nested" },
      "player/bubble/tail": { rotation: 45 }
    });
  });

  it("leaves composition-level overrides untouched when there is no selected component path", () => {
    const overrides = { title: { visible: true } };
    expect(scopeTimelinePreviewOverridesToComponent(overrides, null, null)).toBe(overrides);
    expect(scopeTimelinePreviewOverridesToComponent(overrides, player, [])).toBe(overrides);
  });
});
