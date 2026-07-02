import { describe, expect, it } from "vitest";
import {
  PartyGamePlayerRoster,
  playerAnswerBubbleRuntimeState,
  playerObjectCompositionIdForShape,
  runtimeAnswerBubbleComposition,
  runtimePlayerObjectComponents
} from "./stagePlayerRoster";

describe("PartyGamePlayerRoster (ported player-roster-renderer)", () => {
  it("createRenderer returns the roster surface", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    expect(roster.render).toBeTypeOf("function");
    expect(roster.setShown).toBeTypeOf("function");
    expect(roster.renderPointPopups).toBeTypeOf("function");
  });

  it("setShown returns 0 without a host", () => {
    expect(PartyGamePlayerRoster.createRenderer({}).setShown(true)).toBe(0);
  });

  it("playerSignature is stable for equal players", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const a = roster.playerSignature({ name: "Ava", avatar: { shape: "rex" }, isVip: true });
    const b = roster.playerSignature({ name: "Ava", avatar: { shape: "rex" }, isVip: true });
    expect(a).toBe(b);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGamePlayerRoster?: unknown };
    expect(host.PartyGamePlayerRoster).toBeTypeOf("object");
  });

  it("maps avatar species to player-object compositions with a rex fallback", () => {
    expect(playerObjectCompositionIdForShape("stego")).toBe("player-object-stego");
    expect(playerObjectCompositionIdForShape("")).toBe("player-object-rex");
  });

  it("builds answer bubble runtime state from the displayed player answer", () => {
    expect(
      playerAnswerBubbleRuntimeState({
        displayedAnswer: { text: "ARCTIC", nonce: "answer-1", correct: false }
      })
    ).toEqual({
      hasAnswer: true,
      visible: true,
      text: "ARCTIC",
      nonce: "answer-1",
      correctness: "wrong"
    });
    expect(playerAnswerBubbleRuntimeState({ displayedAnswer: { text: "HIDDEN", hidden: true } })).toMatchObject({
      hasAnswer: false,
      visible: false
    });
  });

  it("injects runtime answer text and correctness into a cloned shared bubble composition", () => {
    const sharedBubble = {
      canvas: { width: 300, height: 180 },
      components: [
        { id: "answer-text", kind: "text", defaultText: "ANSWER", fontColor: "#17131f" },
        { id: "answer-bubble-card", kind: "shape", fillColor: "#fffdf4" },
        { id: "answer-bubble-tail", kind: "shape", fillColor: "#fffdf4" }
      ]
    };

    const runtime = runtimeAnswerBubbleComposition(sharedBubble, {
      hasAnswer: true,
      visible: true,
      text: "ARCTIC",
      nonce: "answer-1",
      correctness: "wrong"
    });

    expect(sharedBubble.components[0].defaultText).toBe("ANSWER");
    expect(runtime.components).toEqual([
      expect.objectContaining({ id: "answer-text", defaultAnimationState: "on", defaultText: "ARCTIC", fontColor: "rgba(23, 19, 31, 0.68)" }),
      expect.objectContaining({ id: "answer-bubble-card", defaultAnimationState: "on", fillColor: "#d7d3c7" }),
      expect.objectContaining({ id: "answer-bubble-tail", defaultAnimationState: "on", fillColor: "#d7d3c7" })
    ]);
  });

  it("keeps player-object reference overrides while applying player color and bubble visibility", () => {
    const playerObject = {
      canvas: { width: 260, height: 260 },
      components: [
        { id: "answer-bubble", kind: "reference", artCompositionId: "player-answer-bubble", x: 130, y: 80, width: 225, height: 135 },
        {
          id: "avatar",
          kind: "container",
          fillColor: "transparent",
          children: [{ id: "dino-mask", kind: "shape", fillColor: "currentColor" }]
        }
      ]
    };

    const components = runtimePlayerObjectComponents(
      playerObject,
      { avatar: { color: "#ff4d8d" } },
      { hasAnswer: true, visible: true, text: "ARCTIC", nonce: "answer-1", correctness: "" }
    );

    expect(components[0]).toMatchObject({
      id: "answer-bubble",
      artCompositionId: "player-answer-bubble",
      width: 225,
      height: 135,
      defaultAnimationState: "on"
    });
    expect((components[1].children as Record<string, unknown>[])[0]).toMatchObject({
      id: "dino-mask",
      fillColor: "currentColor",
      fontColor: "#ff4d8d"
    });
  });
});
