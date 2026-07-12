import { describe, expect, it, vi } from "vitest";
import {
  PLAYER_WIDGET_COMPOSITION_ID,
  PartyGamePlayerRoster,
  avatarTimelineLabelForShape,
  legacyPlayerObjectCompositionIdForShape,
  playerAnswerBubbleRuntimeState,
  playerNameRuntimeText,
  playerVipRuntimeState,
  runtimeAnswerBubbleComposition,
  runtimeAvatarsComposition,
  runtimePlayerAvatarMcComposition,
  runtimePlayerNameWidgetComposition,
  runtimePlayerVipWidgetComposition,
  runtimePlayerWidgetComponents
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

  it("selects the shared player widget and maps species onto the nested avatar timeline", () => {
    const widget = { id: PLAYER_WIDGET_COMPOSITION_ID };
    const roster = PartyGamePlayerRoster.createRenderer({
      getComposition: (id: string) => (id === PLAYER_WIDGET_COMPOSITION_ID ? widget : null)
    });

    expect(roster.playerObjectCompositionFor({ avatar: { shape: "stego" } })).toBe(widget);
    expect(legacyPlayerObjectCompositionIdForShape("stego")).toBe("player-object-stego");
    expect(avatarTimelineLabelForShape("stego")).toBe("Stego");
    expect(avatarTimelineLabelForShape("ankylo")).toBe("Cleo");
    expect(avatarTimelineLabelForShape("")).toBe("Rex");
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

    const components = runtimePlayerWidgetComponents(
      playerObject,
      { avatar: { color: "#ff4d8d" }, isVip: true },
      { hasAnswer: true, visible: true, text: "ARCTIC", nonce: "answer-1", correctness: "" }
    );

    expect(components[0]).toMatchObject({
      id: "answer-bubble",
      artCompositionId: "player-answer-bubble",
      width: 225,
      height: 135,
      defaultAnimationState: "On"
    });
    expect(components[1]).toMatchObject({
      id: "player-name",
      artCompositionId: "player-name-widget",
      width: 118,
      height: 34,
      defaultAnimationState: "On"
    });
    expect(components[2]).toMatchObject({
      id: "vip-badge",
      artCompositionId: "player-vip-widget",
      defaultAnimationState: "On"
    });
    expect((components[3].children as Record<string, unknown>[])[0]).toMatchObject({
      id: "dino-mask",
      fillColor: "currentColor",
      fontColor: "#ff4d8d"
    });
  });

  it("configures the nested player avatar MC with the selected frame and player color", () => {
    const playerAvatarMc = {
      components: [
        { id: "avatar", kind: "reference", artCompositionId: "avatars", defaultAnimationState: "Rex" },
        { id: "avatar-background", kind: "shape", defaultAnimationState: "Park" }
      ]
    };

    const runtime = runtimePlayerAvatarMcComposition(playerAvatarMc, {
      avatar: { shape: "ankylo", color: "#ff4d8d" }
    });

    expect(runtime.components).toEqual([
      expect.objectContaining({ id: "avatar", defaultAnimationState: "Cleo" }),
      expect.objectContaining({ id: "avatar-background", defaultAnimationState: "On" })
    ]);

    const avatars = runtimeAvatarsComposition(
      { components: [{ id: "avatar", kind: "sprite", imageTint: "currentColor" }] },
      { avatar: { color: "#ff4d8d" } }
    );
    expect((avatars.components as Record<string, unknown>[])[0]).toMatchObject({
      id: "avatar",
      imageTint: "currentColor",
      fontColor: "#ff4d8d"
    });
  });

  it("routes player-widget lifecycle calls to the MC layer and avatar selection one level deeper", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const tile = {
      dataset: { playerObjectCompositionId: PLAYER_WIDGET_COMPOSITION_ID }
    } as unknown as HTMLElement;
    const playComponent = vi.fn((_componentId: string, _animation: string, options?: { instant?: boolean }) =>
      options?.instant ? 0 : 333
    );
    const playComponentTree = vi.fn(() => 999);
    const stopAtComponent = vi.fn(() => 0);
    const renderer = {
      render: vi.fn(),
      isComponentVisible: vi.fn(() => false),
      playComponent,
      playComponentTree,
      stopAtComponent
    };

    expect(
      roster.syncAnswerBubbleComponent(
        tile,
        renderer,
        { hasAnswer: true, visible: true, text: "YES", nonce: "1", correctness: "" },
        { previousVisible: false }
      )
    ).toBe(333);
    roster.syncAvatarComponent(tile, renderer, { avatar: { shape: "raptor" } });
    roster.syncPlayerLabelComponents(renderer, { name: "Ava", isVip: true }, { tile, instant: true });

    expect(playComponent).toHaveBeenCalledWith("player-answer-bubble-mc", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("vip-mc", "On", { instant: true });
    expect(playComponentTree).not.toHaveBeenCalled();
    expect(stopAtComponent).toHaveBeenCalledWith("avatar", "Raptor", { instant: true });
  });

  it("shows and hides roster players through the avatar, name, and VIP MC children", () => {
    const classes = new Set(["players-hidden"]);
    const tile = {
      dataset: { playerId: "p1", playerObjectCompositionId: PLAYER_WIDGET_COMPOSITION_ID }
    } as unknown as HTMLElement;
    const host = {
      classList: {
        add: (name: string) => classes.add(name),
        contains: (name: string) => classes.has(name),
        remove: (name: string) => classes.delete(name),
        toggle: (name: string, force?: boolean) => {
          const enabled = force === undefined ? !classes.has(name) : force;
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        }
      },
      dataset: { visualVisible: "false" },
      offsetWidth: 0,
      querySelectorAll: () => [tile]
    } as unknown as HTMLElement;
    const playComponent = vi.fn((_componentId: string, _animation: string, options?: { instant?: boolean }) =>
      options?.instant ? 0 : 333
    );
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    roster.tileRenderers.set(tile, { render: vi.fn(), playComponent });
    roster.tilePlayers.set(tile, { isVip: true });

    expect(roster.setShown(true)).toBe(333);
    expect(classes.has("players-hidden")).toBe(false);
    expect(playComponent).toHaveBeenCalledWith("player-avatar-mc", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("player-name-mc", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("vip-mc", "Appear", { instant: false });

    playComponent.mockClear();
    expect(roster.setShown(false, { instant: true })).toBe(0);
    expect(classes.has("players-hidden")).toBe(true);
    expect(playComponent).toHaveBeenCalledWith("player-avatar-mc", "Park", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("player-name-mc", "Park", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("vip-mc", "Park", { instant: true });
  });

  it("renders point popup prefabs with a timeline fallback when no authored timeline exists", () => {
    const rendered: Record<string, unknown>[] = [];
    class FakeTreeRenderer {
      render(components: Record<string, unknown>[], canvas: Record<string, unknown>, options: Record<string, unknown>) {
        rendered.push({ components, canvas, options });
      }
    }
    const host = globalThis as typeof globalThis & { PartyGameArtObject?: unknown };
    const previous = host.PartyGameArtObject;
    host.PartyGameArtObject = { ArtObjectTreeRenderer: FakeTreeRenderer };
    const node = {
      classList: { add: () => undefined },
      style: {},
      dataset: {}
    };
    const roster = PartyGamePlayerRoster.createRenderer({
      getComposition: () => ({
        id: "player-point-popup",
        canvas: { width: 150, height: 60 },
        components: [
          { id: "point-text", kind: "text", defaultText: "+200" },
          { id: "point-shadow", kind: "text", defaultText: "+200" }
        ]
      })
    });

    expect(roster.renderPointPopupPrefab(node as unknown as HTMLElement, { points: 50 })).toBe(true);
    host.PartyGameArtObject = previous;

    expect(rendered[0].components).toEqual([
      expect.objectContaining({ id: "point-text", defaultText: "+50" }),
      expect.objectContaining({ id: "point-shadow", defaultText: "+50" })
    ]);
    expect((rendered[0].options as { timeline: { labels: { name: string }[]; tracks: { targetId: string }[] } }).timeline.labels.map((label) => label.name)).toContain(
      "Appear"
    );
    expect((rendered[0].options as { timeline: { tracks: { targetId: string }[] } }).timeline.tracks.map((track) => track.targetId)).toEqual([
      "point-text",
      "point-shadow"
    ]);
  });

  it("plays point popup prefab timelines through the art renderer", () => {
    const node = {
      classList: {
        remove: (name: string) => {
          (node as { removedClass?: string }).removedClass = name;
        },
        add: () => undefined
      },
      remove: () => {
        (node as { removed?: boolean }).removed = true;
      }
    };
    const playAll = vi.fn(() => 250);
    const timers: number[] = [];
    const roster = PartyGamePlayerRoster.createRenderer({ timerSink: (id: number) => timers.push(id) });
    roster.pointPopupRenderers.set(node as unknown as HTMLElement, { render: vi.fn(), playAll });

    expect(roster.playPointPopup(node as unknown as HTMLElement, { id: "popup-1" })).toBe(250);

    expect((node as { removedClass?: string }).removedClass).toBe("point-popup-hidden");
    expect(playAll).toHaveBeenCalledWith("appear", { instant: false });
    expect(timers).toHaveLength(1);
  });
});
