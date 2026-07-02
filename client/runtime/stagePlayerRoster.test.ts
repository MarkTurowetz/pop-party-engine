import { describe, expect, it } from "vitest";
import {
  PartyGamePlayerRoster,
  playerAnswerBubbleRuntimeState,
  playerNameRuntimeText,
  playerObjectCompositionIdForShape,
  playerVipRuntimeState,
  runtimeAnswerBubbleComposition,
  runtimePlayerNameWidgetComposition,
  runtimePlayerVipWidgetComposition,
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

  it("lays out player object tiles by their origin centers inside the roster container", () => {
    const style = () => ({
      left: "",
      top: "",
      getPropertyValue: () => ""
    });
    const tiles = [
      { dataset: { playerObjectWidth: "100", playerObjectHeight: "80", playerId: "a" }, style: style() },
      { dataset: { playerObjectWidth: "300", playerObjectHeight: "80", playerId: "b" }, style: style() },
      { dataset: { playerObjectWidth: "100", playerObjectHeight: "80", playerId: "c" }, style: style() }
    ];
    const host = {
      clientWidth: 1000,
      clientHeight: 200,
      querySelectorAll: () => tiles
    };

    PartyGamePlayerRoster.createRenderer({ host }).layoutTiles();

    expect(tiles.map((tile) => [tile.style.left, tile.style.top])).toEqual([
      ["175px", "100px"],
      ["500px", "100px"],
      ["825px", "100px"]
    ]);
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

  it("injects player names into a cloned shared name widget composition", () => {
    const sharedName = {
      components: [
        { id: "name-card", kind: "shape", fillColor: "#fffdf4" },
        { id: "name-text", kind: "text", defaultText: "Player" }
      ]
    };

    const runtime = runtimePlayerNameWidgetComposition(sharedName, { name: "Ava" });

    expect(playerNameRuntimeText({ name: "Ava" })).toBe("Ava");
    expect(sharedName.components[1].defaultText).toBe("Player");
    expect(runtime.components).toEqual([
      expect.objectContaining({ id: "name-card", defaultAnimationState: "on" }),
      expect.objectContaining({ id: "name-text", defaultAnimationState: "on", defaultText: "Ava" })
    ]);
  });

  it("parks a cloned shared VIP widget when the player is not VIP", () => {
    const sharedVip = {
      components: [
        { id: "vip-card", kind: "shape", fillColor: "#ffe256" },
        { id: "vip-text", kind: "text", defaultText: "VIP" }
      ]
    };

    const runtime = runtimePlayerVipWidgetComposition(sharedVip, playerVipRuntimeState({ isVip: false }));

    expect(runtime.components).toEqual([
      expect.objectContaining({ id: "vip-card", defaultAnimationState: "park" }),
      expect.objectContaining({ id: "vip-text", defaultAnimationState: "park", defaultText: "VIP" })
    ]);
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
        { id: "player-name", kind: "reference", artCompositionId: "player-name-widget", x: 130, y: 300, width: 118, height: 34 },
        { id: "vip-badge", kind: "reference", artCompositionId: "player-vip-widget", x: 130, y: 334, width: 44, height: 22 },
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
      { avatar: { color: "#ff4d8d" }, isVip: true },
      { hasAnswer: true, visible: true, text: "ARCTIC", nonce: "answer-1", correctness: "" }
    );

    expect(components[0]).toMatchObject({
      id: "answer-bubble",
      artCompositionId: "player-answer-bubble",
      width: 225,
      height: 135,
      defaultAnimationState: "on"
    });
    expect(components[1]).toMatchObject({
      id: "player-name",
      artCompositionId: "player-name-widget",
      width: 118,
      height: 34,
      defaultAnimationState: "on"
    });
    expect(components[2]).toMatchObject({
      id: "vip-badge",
      artCompositionId: "player-vip-widget",
      defaultAnimationState: "on"
    });
    expect((components[3].children as Record<string, unknown>[])[0]).toMatchObject({
      id: "dino-mask",
      fillColor: "currentColor",
      fontColor: "#ff4d8d"
    });
  });
});
