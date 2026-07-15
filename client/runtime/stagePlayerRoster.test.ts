import { describe, expect, it, vi } from "vitest";
import {
  PLAYER_WIDGET_COMPOSITION_ID,
  PartyGamePlayerRoster,
  avatarTimelineLabelForShape,
  playerAnswerBubbleRuntimeState,
  playerAnswerBubbleStateLabel,
  playerNameRuntimeText,
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
    expect(avatarTimelineLabelForShape("stego")).toBe("Stego");
    expect(avatarTimelineLabelForShape("ankylo")).toBe("Cleo");
    expect(avatarTimelineLabelForShape("")).toBe("Rex");
  });

  it("does not fall back to legacy species-specific player objects", () => {
    const getComposition = vi.fn(() => null);
    const roster = PartyGamePlayerRoster.createRenderer({ getComposition });

    expect(roster.playerObjectCompositionFor({ avatar: { shape: "stego" } })).toBeNull();
    expect(getComposition).toHaveBeenCalledTimes(1);
    expect(getComposition).toHaveBeenCalledWith(PLAYER_WIDGET_COMPOSITION_ID);
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
      hasAnswer: true,
      visible: false
    });
  });

  it("plays Disappear for filtered answer bubbles instead of relying on hidden state", () => {
    const tile = {
      dataset: {
        answerBubbleCorrectness: "wrong",
        answerBubbleHasAnswer: "true",
        answerBubbleNonce: "answer-1",
        answerBubbleText: "ARCTIC",
        answerBubbleVisible: "true",
        playerId: "p1",
        playerObjectCompositionId: PLAYER_WIDGET_COMPOSITION_ID
      }
    } as unknown as HTMLElement;
    const host = { querySelectorAll: () => [tile] } as unknown as HTMLElement;
    const playComponent = vi.fn(() => 333);
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    roster.tilePlayers.set(tile, {
      displayedAnswer: { correct: null, hidden: true, nonce: "answer-1", text: "ARCTIC" }
    });
    roster.tileRenderers.set(tile, {
      render: vi.fn(),
      isComponentVisible: vi.fn(() => true),
      playComponent
    });

    expect(roster.setAnswerBubblesShown(false, { playerFilter: "wrong" })).toBe(333);
    expect(playComponent).toHaveBeenCalledWith("player-answer-bubble-mc", "Disappear", { instant: false });
    expect(tile.dataset.answerBubbleVisible).toBe("false");
    expect(tile.dataset.answerBubbleHasAnswer).toBe("true");
  });

  it("injects player names without changing authored lifecycle states", () => {
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
      expect.objectContaining({ id: "name-card" }),
      expect.objectContaining({ id: "name-text", defaultText: "Ava" })
    ]);
    expect((runtime.components as Record<string, unknown>[]).some((component) => "defaultAnimationState" in component)).toBe(false);
  });

  it("injects VIP text without changing authored lifecycle states", () => {
    const sharedVip = {
      components: [
        { id: "vip-card", kind: "shape", fillColor: "#ffe256" },
        { id: "vip-text", kind: "text", defaultText: "VIP" }
      ]
    };

    const runtime = runtimePlayerVipWidgetComposition(sharedVip);

    expect(runtime.components).toEqual([
      expect.objectContaining({ id: "vip-card" }),
      expect.objectContaining({ id: "vip-text", defaultText: "VIP" })
    ]);
    expect((runtime.components as Record<string, unknown>[]).some((component) => "defaultAnimationState" in component)).toBe(false);
  });

  it("injects runtime answer text without overriding authored semantic colors", () => {
    const sharedBubble = {
      canvas: { width: 300, height: 180 },
      components: [
        { id: "answer-text", kind: "text", defaultText: "ANSWER", fontColor: "#17131f", defaultAnimationState: "Park" },
        { id: "answer-bubble-card", kind: "shape", fillColor: "#fffdf4", defaultAnimationState: "Park" },
        { id: "answer-bubble-tail", kind: "shape", fillColor: "#fffdf4", defaultAnimationState: "Park" }
      ],
      timeline: {
        tracks: [{ targetId: "answer-text", keyframes: [
          { frame: 0, props: { defaultText: "ANSWER", fontColor: "#17131f" } },
          { frame: 1, props: { defaultText: "ANSWER", fontColor: "#181f13" } },
          { frame: 2, props: { defaultText: "ANSWER", fontColor: "#17131f" } }
        ] }]
      }
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
      expect.objectContaining({ id: "answer-text", defaultAnimationState: "Park", defaultText: "ARCTIC", fontColor: "#17131f" }),
      expect.objectContaining({ id: "answer-bubble-card", defaultAnimationState: "Park", fillColor: "#fffdf4" }),
      expect.objectContaining({ id: "answer-bubble-tail", defaultAnimationState: "Park", fillColor: "#fffdf4" })
    ]);
    expect((runtime.timeline as { tracks: { keyframes: { props: { defaultText: string; fontColor: string } }[] }[] }).tracks[0].keyframes).toEqual([
      { frame: 0, props: { defaultText: "ARCTIC", fontColor: "#17131f" } },
      { frame: 1, props: { defaultText: "ARCTIC", fontColor: "#181f13" } },
      { frame: 2, props: { defaultText: "ARCTIC", fontColor: "#17131f" } }
    ]);
    expect(sharedBubble.timeline.tracks[0].keyframes[0].props.defaultText).toBe("ANSWER");
  });

  it("maps answer correctness onto the three authored bubble states", () => {
    expect(playerAnswerBubbleStateLabel({ hasAnswer: true, visible: true, text: "", nonce: "", correctness: "" })).toBe("Default");
    expect(playerAnswerBubbleStateLabel({ hasAnswer: true, visible: true, text: "", nonce: "", correctness: "correct" })).toBe("Correct");
    expect(playerAnswerBubbleStateLabel({ hasAnswer: true, visible: true, text: "", nonce: "", correctness: "wrong" })).toBe("Incorrect");
  });

  it("keeps player-object reference overrides while applying player color and bubble visibility", () => {
    const playerObject = {
      canvas: { width: 260, height: 260 },
      components: [
        { id: "answer-bubble", kind: "reference", artCompositionId: "player-answer-bubble", x: 130, y: 80, width: 225, height: 135, defaultAnimationState: "Park" },
        { id: "player-name", kind: "reference", artCompositionId: "player-name-widget", x: 130, y: 300, width: 118, height: 34, defaultAnimationState: "Off" },
        { id: "vip-badge", kind: "reference", artCompositionId: "player-vip-widget", x: 130, y: 334, width: 44, height: 22, defaultAnimationState: "Off" },
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
      { avatar: { color: "#ff4d8d" }, isVip: true }
    );

    expect(components[0]).toMatchObject({
      id: "answer-bubble",
      artCompositionId: "player-answer-bubble",
      width: 225,
      height: 135,
      defaultAnimationState: "Park"
    });
    expect(components[1]).toMatchObject({
      id: "player-name",
      artCompositionId: "player-name-widget",
      width: 118,
      height: 34,
      defaultAnimationState: "Off"
    });
    expect(components[2]).toMatchObject({
      id: "vip-badge",
      artCompositionId: "player-vip-widget",
      defaultAnimationState: "Off"
    });
    expect((components[3].children as Record<string, unknown>[])[0]).toMatchObject({
      id: "dino-mask",
      fillColor: "currentColor",
      fontColor: "#ff4d8d"
    });
  });

  it("configures nested player avatar color without changing authored lifecycle states", () => {
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
      expect.objectContaining({ id: "avatar", defaultAnimationState: "Rex" }),
      expect.objectContaining({ id: "avatar-background", defaultAnimationState: "Park" })
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
    const playComponent = vi.fn((_componentId: string, _animation: string, options?: { instant?: boolean }) =>
      options?.instant ? 0 : 333
    );
    const stopAtComponent = vi.fn(() => 0);
    const renderer = {
      render: vi.fn(),
      isComponentVisible: vi.fn(() => false),
      playComponent,
      stopAtComponent
    };

    expect(
      roster.syncAnswerBubbleComponent(
        renderer,
        { hasAnswer: true, visible: true, text: "YES", nonce: "1", correctness: "" },
        { previousVisible: false }
      )
    ).toBe(333);
    roster.syncAvatarComponent(renderer, { avatar: { shape: "raptor" } });
    roster.syncPlayerLabelComponents(renderer, { name: "Ava", isVip: true }, { instant: true });

    expect(playComponent).toHaveBeenCalledWith("player-answer-bubble-mc", "Appear", { instant: false });
    expect(stopAtComponent).toHaveBeenCalledWith("playerAnswerBubble", "Default", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("player-avatar-mc", "On", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("player-name-mc", "On", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("vip-mc", "On", { instant: true });
    expect(stopAtComponent).toHaveBeenCalledWith("avatar", "Raptor", { instant: true });
  });

  it("selects the authored correctness state before the bubble lifecycle update", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const calls: string[] = [];
    const renderer = {
      render: vi.fn(),
      isComponentVisible: vi.fn(() => true),
      playComponent: vi.fn((_componentId: string, animation: string) => {
        calls.push(`lifecycle:${animation}`);
        return 333;
      }),
      stopAtComponent: vi.fn((_componentId: string, animation: string) => {
        calls.push(`state:${animation}`);
        return 0;
      })
    };

    expect(
      roster.syncAnswerBubbleComponent(
        renderer,
        { hasAnswer: true, visible: true, text: "YES", nonce: "2", correctness: "correct" },
        { previousVisible: true, previousNonce: "1", previousText: "YES", previousCorrectness: "" }
      )
    ).toBe(333);
    expect(calls).toEqual(["state:Correct", "lifecycle:Update"]);
  });

  it("lets the reveal action explicitly select Correct and Incorrect on each answer bubble", () => {
    const correctTile = { dataset: { playerId: "correct" } } as unknown as HTMLElement;
    const incorrectTile = { dataset: { playerId: "incorrect" } } as unknown as HTMLElement;
    const host = { querySelectorAll: () => [correctTile, incorrectTile] } as unknown as HTMLElement;
    const correctStop = vi.fn(() => 0);
    const incorrectStop = vi.fn(() => 0);
    const correctUpdate = vi.fn(() => 333);
    const incorrectUpdate = vi.fn(() => 333);
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    roster.tilePlayers.set(correctTile, { id: "correct", displayedAnswer: { text: "YES", correct: null } });
    roster.tilePlayers.set(incorrectTile, { id: "incorrect", displayedAnswer: { text: "NO", correct: null } });
    roster.tileRenderers.set(correctTile, {
      render: vi.fn(),
      isComponentVisible: vi.fn(() => true),
      stopAtComponent: correctStop,
      playComponent: correctUpdate
    });
    roster.tileRenderers.set(incorrectTile, {
      render: vi.fn(),
      isComponentVisible: vi.fn(() => true),
      stopAtComponent: incorrectStop,
      playComponent: incorrectUpdate
    });

    expect(roster.revealAnswerCorrectness({
      answerCorrectness: {
        correctPlayerIds: ["correct"],
        incorrectPlayerIds: ["incorrect"]
      }
    })).toBe(333);
    expect(correctStop).toHaveBeenCalledWith("playerAnswerBubble", "Correct", { instant: true });
    expect(incorrectStop).toHaveBeenCalledWith("playerAnswerBubble", "Incorrect", { instant: true });
    expect(correctUpdate).toHaveBeenCalledWith("player-answer-bubble-mc", "Update", { instant: false });
    expect(incorrectUpdate).toHaveBeenCalledWith("player-answer-bubble-mc", "Update", { instant: false });
    expect(correctTile.dataset.answerBubbleCorrectness).toBe("correct");
    expect(incorrectTile.dataset.answerBubbleCorrectness).toBe("wrong");
  });

  it("drives choosing status through the nested avatar behavior timeline", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const playComponent = vi.fn(() => 333);
    const stopAtComponent = vi.fn(() => 0);
    const renderer = { render: vi.fn(), playComponent, stopAtComponent };

    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: false }, {})).toBe(0);
    expect(stopAtComponent).toHaveBeenCalledWith("player-avatar-behaviors", "Default", { instant: true });

    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: true }, { previousNeedsInput: "false" })).toBe(333);
    expect(playComponent).toHaveBeenCalledWith("player-avatar-behaviors", "ChoosingStart", { instant: false });

    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: false }, { previousNeedsInput: "true" })).toBe(333);
    expect(playComponent).toHaveBeenCalledWith("player-avatar-behaviors", "ChoosingEnd", { instant: false });

    playComponent.mockClear();
    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: false }, { previousNeedsInput: "false" })).toBe(0);
    expect(playComponent).not.toHaveBeenCalled();
  });

  it("prepares answer content before playing the nested MC without attaching the parent timeline", () => {
    const order: string[] = [];
    const composition = {
      id: PLAYER_WIDGET_COMPOSITION_ID,
      canvas: { width: 300, height: 370 },
      timeline: { fps: 30, frameCount: 33, labels: [{ name: "Park", frame: 0 }], commands: [], tracks: [] },
      components: [
        {
          id: "player-answer-bubble-mc",
          kind: "reference",
          artCompositionId: "prefab-player-answer-bubble-mc",
          defaultAnimationState: "Park"
        }
      ]
    };
    const objectHost = { style: { width: "", height: "", color: "" } } as unknown as HTMLElement;
    const tile = {
      dataset: { playerId: "p1" },
      style: { setProperty: vi.fn() },
      querySelector: () => objectHost
    } as unknown as HTMLElement;
    const renderer = {
      render: vi.fn(
        (_components: Record<string, unknown>[], _canvas: Record<string, unknown>, _options: Record<string, unknown>) =>
          order.push("render")
      ),
      isComponentVisible: vi.fn(() => false),
      playComponent: vi.fn((componentId: string, animation: string) => {
        order.push(`${componentId}:${animation}`);
        return 333;
      }),
      stopAtComponent: vi.fn(() => 0)
    };
    const roster = PartyGamePlayerRoster.createRenderer({
      getComposition: (id: string) => (id === PLAYER_WIDGET_COMPOSITION_ID ? composition : null)
    });
    roster.tileRenderers.set(tile, renderer);

    expect(
      roster.syncPlayerObject(tile, {
        id: "p1",
        name: "Ava",
        avatar: { shape: "rex", color: "#22d3ee" },
        displayedAnswer: { text: "ARCTIC", nonce: "answer-1" }
      })
    ).toBe(333);

    const [renderedComponents, , renderOptions] = renderer.render.mock.calls[0];
    expect(renderedComponents[0]).toMatchObject({
      id: "player-answer-bubble-mc",
      defaultAnimationState: "Park"
    });
    expect(renderOptions).not.toHaveProperty("timeline");
    expect(order).toEqual([
      "render",
      "player-avatar-mc:On",
      "player-answer-bubble-mc:Appear",
      "player-name-mc:Appear"
    ]);
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
    expect(playComponent).toHaveBeenCalledWith("player-avatar-mc", "Off", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("player-name-mc", "Off", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("vip-mc", "Off", { instant: true });
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
