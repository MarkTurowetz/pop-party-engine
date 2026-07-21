import { describe, expect, it, vi } from "vitest";
import {
  PLAYER_WIDGET_COMPOSITION_ID,
  PartyGamePlayerRoster,
  authoredCanvasPointViewportPosition,
  avatarTimelineLabelForShape,
  pointPopupOverlayPosition,
  playerWidgetPointPopupAnchorPosition,
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
  it("projects the authored container center through the Player Widget MC canvas", () => {
    expect(authoredCanvasPointViewportPosition(
      { x: 30, y: 40 },
      { width: 300, height: 370 },
      { left: 200, top: 80, width: 150, height: 185 }
    )).toEqual({ x: 215, y: 100 });
  });

  it("uses the Player Widget On keyframe for the popup anchor before its stale base position", () => {
    expect(playerWidgetPointPopupAnchorPosition({
      components: [{ id: "point-popup-container", x: 150, y: 180 }],
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [{ name: "Off", frame: 0 }, { name: "On", frame: 1 }],
        commands: [],
        tracks: [{
          id: "track-point-popup-container",
          targetId: "point-popup-container",
          keyframes: [{ frame: 0, props: { x: 150, y: 81 }, easing: "hold" }]
        }]
      }
    })).toEqual({ x: 150, y: 81 });
  });

  it("resolves a regenerated popup anchor through its stable instance label", () => {
    expect(playerWidgetPointPopupAnchorPosition({
      components: [{ id: "generated-anchor-id", instanceLabel: "pointPopupContainer", x: 44, y: 55 }],
      timeline: {
        fps: 30,
        frameCount: 2,
        labels: [{ name: "On", frame: 1 }],
        commands: [],
        tracks: [{
          id: "track-generated-anchor",
          targetId: "generated-anchor-id",
          keyframes: [{ frame: 0, props: { x: 64, y: 75 }, easing: "hold" }]
        }]
      }
    })).toEqual({ x: 64, y: 75 });
  });

  it("converts the authored player anchor center into unclipped roster overlay coordinates", () => {
    expect(pointPopupOverlayPosition(
      { left: 225, top: 75, width: 50, height: 20 },
      { left: 100, top: 50, width: 500, height: 100 },
      { width: 1000, height: 200 }
    )).toEqual({ left: 300, top: 70 });
  });

  it("createRenderer returns the roster surface", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    expect(roster.render).toBeTypeOf("function");
    expect(roster.setShown).toBeTypeOf("function");
    expect(roster.renderPointPopups).toBeTypeOf("function");
  });

  it("positions a popup from pointPopupContainer authored x/y rather than avatar geometry", () => {
    const playerObject = {
      getBoundingClientRect: () => ({ left: 200, top: 80, width: 150, height: 185 })
    };
    const tile = {
      querySelector: () => playerObject
    } as unknown as HTMLElement;
    const host = {
      clientWidth: 1000,
      clientHeight: 400,
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 200 })
    } as unknown as HTMLElement;
    const node = { style: {} } as unknown as HTMLElement;
    const roster = PartyGamePlayerRoster.createRenderer({
      host,
      getComposition: () => ({
        id: PLAYER_WIDGET_COMPOSITION_ID,
        canvas: { width: 300, height: 370 },
        components: [
          { id: "player-avatar-mc", x: 150, y: 234 },
          { id: "point-popup-container", x: 150, y: 180, width: 154, height: 64 }
        ],
        timeline: {
          fps: 30,
          frameCount: 2,
          labels: [{ name: "Off", frame: 0 }, { name: "On", frame: 1 }],
          commands: [],
          tracks: [{
            id: "track-point-popup-container",
            targetId: "point-popup-container",
            keyframes: [{ frame: 0, props: { x: 150, y: 81 }, easing: "hold" }]
          }]
        }
      })
    });
    roster.tilePlayers.set(tile, { id: "player-1" });

    expect(roster.positionPointPopup(node, tile)).toBe(true);
    expect(node.style.left).toBe("350px");
    expect(node.style.top).toBe("141px");
    expect(node.style.top).not.toBe("294px");
  });

  it("prefers the awarded player's live pointPopupContainer over stale composition coordinates", () => {
    const liveAnchor = {
      getBoundingClientRect: () => ({ left: 250, top: 150, width: 50, height: 20 })
    };
    const tile = {} as HTMLElement;
    const host = {
      clientWidth: 1000,
      clientHeight: 400,
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 200 })
    } as unknown as HTMLElement;
    const node = { style: {} } as unknown as HTMLElement;
    const viewForComponentId = vi.fn((target: string) => target === "pointPopupContainer" ? { element: liveAnchor } : null);
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    roster.tileRenderers.set(tile, { render: vi.fn(), viewForComponentId } as never);

    expect(roster.positionPointPopup(node, tile)).toBe(true);
    expect(viewForComponentId).toHaveBeenCalledWith("pointPopupContainer");
    expect(node.style.left).toBe("350px");
    expect(node.style.top).toBe("220px");
  });

  it("repositions pending point popups when their show action begins", () => {
    const host = { querySelectorAll: () => [] } as unknown as HTMLElement;
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    const positionPointPopups = vi.spyOn(roster, "positionPointPopups");

    roster.showPointPopupsForAction();

    expect(positionPointPopups).toHaveBeenCalledOnce();
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
    const playComponent = vi.fn((_componentId: string, _animation: string, _options?: Record<string, unknown>) => 333);
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
    expect(playComponent).toHaveBeenCalledWith("playerAnswerBubbleMC", "Disappear", { instant: false });
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

  it("injects voice text into a regenerated current answer-bubble leaf by its authored label", () => {
    const authored = {
      name: "Player Answer Bubble",
      components: [{ id: "text-regenerated", instanceLabel: "answerText", kind: "text", defaultText: "ANSWER" }],
      timeline: {
        tracks: [{ targetId: "text-regenerated", keyframes: [{ frame: 0, props: { defaultText: "ANSWER" } }] }]
      }
    };

    const runtime = runtimeAnswerBubbleComposition(authored, {
      hasAnswer: true,
      visible: true,
      text: "JURASSIC PARK",
      nonce: "voice-2",
      correctness: ""
    });

    expect((runtime.components as Record<string, unknown>[])[0].defaultText).toBe("JURASSIC PARK");
    expect((((runtime.timeline as Record<string, unknown>).tracks as Record<string, unknown>[])[0].keyframes as Record<string, unknown>[])[0].props)
      .toEqual({ defaultText: "JURASSIC PARK" });
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

  it("keeps setup state selection separate from fire-and-forget spawn lifecycle", () => {
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
    roster.playSpawnedPlayerWidget(renderer, { name: "Ava", isVip: true });

    expect(playComponent).toHaveBeenCalledWith("playerAnswerBubbleMC", "Appear", { instant: false });
    expect(playComponent).not.toHaveBeenCalledWith("playerAvatarMC", "On", expect.anything());
    expect(playComponent).toHaveBeenCalledWith("playerAvatarMC", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("playerNameMC", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("vipMC", "Appear", { instant: false });
    for (const call of playComponent.mock.calls) expect(call[2]).not.toHaveProperty("complete");
    expect(stopAtComponent).toHaveBeenCalledWith("avatar", "Raptor", { instant: true });
  });

  it("completes immediately when an answer bubble is already appearing", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const complete = vi.fn();
    const playComponent = vi.fn((_componentId: string, _animation: string, options?: Record<string, unknown>) => {
      (options?.complete as (() => void) | undefined)?.();
      return 240;
    });
    const renderer = {
      render: vi.fn(),
      componentLifecycleState: vi.fn(() => "appearing"),
      isComponentVisible: vi.fn(() => true),
      playComponent,
      stopAtComponent: vi.fn(() => 0)
    };

    expect(
      roster.syncAnswerBubbleComponent(
        renderer,
        { hasAnswer: true, visible: true, text: "YES", nonce: "1", correctness: "" },
        { previousVisible: true, previousNonce: "1", previousText: "YES", instant: true, complete }
      )
    ).toBe(0);

    expect(playComponent).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("completes immediately when an answer bubble is already disappearing", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const complete = vi.fn();
    const playComponent = vi.fn(() => 180);
    const renderer = {
      render: vi.fn(),
      componentLifecycleState: vi.fn(() => "disappearing"),
      isComponentVisible: vi.fn(() => true),
      playComponent,
      stopAtComponent: vi.fn(() => 0)
    };

    expect(
      roster.syncAnswerBubbleComponent(
        renderer,
        { hasAnswer: true, visible: false, text: "YES", nonce: "1", correctness: "" },
        { previousVisible: false, previousNonce: "1", previousText: "YES", instant: true, complete }
      )
    ).toBe(0);

    expect(playComponent).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("updates the current answer-bubble MC when a voice preview becomes the final transcript", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const playComponent = vi.fn(() => 333);
    const renderer = {
      render: vi.fn(),
      componentLifecycleState: vi.fn(() => "shown"),
      isComponentVisible: vi.fn(() => true),
      playComponent,
      stopAtComponent: vi.fn(() => 0)
    };

    expect(roster.syncAnswerBubbleComponent(
      renderer,
      { hasAnswer: true, visible: true, text: "JURASSIC PARK", nonce: "voice-final", correctness: "" },
      { previousVisible: true, previousNonce: "voice-preview", previousText: "T", updateOnContentChange: true }
    )).toBe(333);

    expect(playComponent).toHaveBeenCalledWith("playerAnswerBubbleMC", "Update", { instant: false });
  });

  it("reports answer lifecycle playback from the timeline state instead of a duration estimate", () => {
    const tile = {} as HTMLElement;
    const host = { querySelectorAll: () => [tile] } as unknown as HTMLElement;
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    const componentLifecycleState = vi.fn(() => "appearing");
    roster.tileRenderers.set(tile, { render: vi.fn(), componentLifecycleState });

    expect(roster.answerBubblesAnimating()).toBe(true);

    componentLifecycleState.mockReturnValue("shown");
    expect(roster.answerBubblesAnimating()).toBe(false);
  });

  it("completes an answer visibility action only after every targeted timeline finishes", () => {
    const tiles = ["p1", "p2"].map((playerId) => ({
      dataset: {
        answerBubbleCorrectness: "wrong",
        answerBubbleNonce: `answer-${playerId}`,
        answerBubbleText: playerId,
        answerBubbleVisible: "false",
        playerId
      }
    })) as unknown as HTMLElement[];
    const host = { querySelectorAll: () => tiles } as unknown as HTMLElement;
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    const timelineCompletions: Array<() => void> = [];
    for (const tile of tiles) {
      roster.tilePlayers.set(tile, {
        id: tile.dataset.playerId,
        displayedAnswer: { correct: false, hidden: true, nonce: tile.dataset.answerBubbleNonce, text: tile.dataset.answerBubbleText }
      });
      roster.tileRenderers.set(tile, {
        render: vi.fn(),
        componentLifecycleState: vi.fn(() => "shown"),
        playComponent: vi.fn((_componentId, _animation, options) => {
          timelineCompletions.push(options?.complete as () => void);
          return tile.dataset.playerId === "p1" ? 180 : 300;
        }),
        stopAtComponent: vi.fn(() => 0)
      });
    }
    const complete = vi.fn();

    expect(roster.setAnswerBubblesShown(false, { playerFilter: "wrong", complete })).toBe(300);
    expect(timelineCompletions).toHaveLength(2);

    timelineCompletions[0]();
    expect(complete).not.toHaveBeenCalled();
    timelineCompletions[1]();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("does not select a correctness state while completing a duplicate lifecycle target", () => {
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
        { previousVisible: true, previousNonce: "2", previousText: "YES", previousCorrectness: "" }
      )
    ).toBe(0);
    expect(calls).toEqual([]);
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
    })).toBe(0);
    expect(correctStop).toHaveBeenCalledWith("playerAnswerBubble", "Correct", { instant: true });
    expect(incorrectStop).toHaveBeenCalledWith("playerAnswerBubble", "Incorrect", { instant: true });
    expect(correctUpdate).not.toHaveBeenCalled();
    expect(incorrectUpdate).not.toHaveBeenCalled();
    expect(correctTile.dataset.answerBubbleCorrectness).toBe("correct");
    expect(incorrectTile.dataset.answerBubbleCorrectness).toBe("wrong");
  });

  it("never sends Default during correctness reveal when the action classification is incomplete", () => {
    const correctTile = { dataset: { playerId: "correct" } } as unknown as HTMLElement;
    const incorrectTile = { dataset: { playerId: "incorrect" } } as unknown as HTMLElement;
    const host = { querySelectorAll: () => [correctTile, incorrectTile] } as unknown as HTMLElement;
    const correctStop = vi.fn(() => 0);
    const incorrectStop = vi.fn(() => 0);
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    roster.tilePlayers.set(correctTile, { id: "correct", displayedAnswer: { text: "YES", correct: true } });
    roster.tilePlayers.set(incorrectTile, { id: "incorrect", displayedAnswer: { text: "NO", correct: false } });
    roster.tileRenderers.set(correctTile, { render: vi.fn(), stopAtComponent: correctStop });
    roster.tileRenderers.set(incorrectTile, { render: vi.fn(), stopAtComponent: incorrectStop });

    roster.revealAnswerCorrectness({
      answerCorrectness: { correctPlayerIds: [], incorrectPlayerIds: [] }
    });

    expect(correctStop).toHaveBeenCalledWith("playerAnswerBubble", "Correct", { instant: true });
    expect(incorrectStop).toHaveBeenCalledWith("playerAnswerBubble", "Incorrect", { instant: true });
    expect(correctStop).not.toHaveBeenCalledWith("playerAnswerBubble", "Default", expect.anything());
    expect(incorrectStop).not.toHaveBeenCalledWith("playerAnswerBubble", "Default", expect.anything());
  });

  it("preserves the semantic state selected by the reveal action across room reconciliation", () => {
    const composition = {
      id: PLAYER_WIDGET_COMPOSITION_ID,
      canvas: { width: 300, height: 370 },
      components: []
    };
    const objectHost = { style: { width: "", height: "", color: "" } } as unknown as HTMLElement;
    const tile = {
      dataset: {
        playerId: "p1",
        playerNeedsInput: "false",
        answerBubbleNonce: "answer-1",
        answerBubbleText: "NO",
        answerBubbleCorrectness: "wrong"
      },
      style: { setProperty: vi.fn() },
      querySelector: () => objectHost
    } as unknown as HTMLElement;
    const stopAtComponent = vi.fn(() => 0);
    const roster = PartyGamePlayerRoster.createRenderer({
      getComposition: (id: string) => (id === PLAYER_WIDGET_COMPOSITION_ID ? composition : null)
    });
    roster.tileRenderers.set(tile, {
      render: vi.fn(),
      playComponent: vi.fn(() => 0),
      stopAtComponent
    });

    roster.syncPlayerObject(tile, {
      id: "p1",
      name: "Ava",
      avatar: { shape: "rex", color: "#22d3ee" },
      displayedAnswer: { text: "NO", nonce: "answer-1" }
    });

    expect(stopAtComponent).toHaveBeenCalledWith("playerAnswerBubble", "Incorrect", { instant: true });
    expect(tile.dataset.answerBubbleCorrectness).toBe("wrong");
  });

  it("completes correctness only after every directly targeted bubble reports its state selection", async () => {
    const correctTile = { dataset: { playerId: "correct" } } as unknown as HTMLElement;
    const incorrectTile = { dataset: { playerId: "incorrect" } } as unknown as HTMLElement;
    const host = { querySelectorAll: () => [correctTile, incorrectTile] } as unknown as HTMLElement;
    const targetCompletions: Array<() => void> = [];
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    for (const tile of [correctTile, incorrectTile]) {
      roster.tilePlayers.set(tile, { id: tile.dataset.playerId, displayedAnswer: { text: "ANSWER" } });
      roster.tileRenderers.set(tile, {
        render: vi.fn(),
        stopAtComponent: vi.fn((_componentId, _state, options) => {
          targetCompletions.push(options?.complete as () => void);
          return 1;
        })
      });
    }
    const complete = vi.fn();

    roster.revealAnswerCorrectness({
      answerCorrectness: { correctPlayerIds: ["correct"], incorrectPlayerIds: ["incorrect"] },
      complete
    });

    expect(targetCompletions).toHaveLength(2);
    targetCompletions[0]();
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
    targetCompletions[1]();
    await Promise.resolve();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("drives choosing status through the nested avatar behavior timeline", () => {
    const roster = PartyGamePlayerRoster.createRenderer({});
    const playComponent = vi.fn((_componentId: string, _animation: string, _options?: Record<string, unknown>) => 333);
    const stopAtComponent = vi.fn(() => 0);
    const renderer = { render: vi.fn(), playComponent, stopAtComponent };

    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: false }, {})).toBe(0);
    expect(stopAtComponent).toHaveBeenCalledWith("playerAvatarBehaviors", "Default", { instant: true });

    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: true }, { previousNeedsInput: "false" })).toBe(0);
    expect(playComponent).toHaveBeenCalledWith("playerAvatarBehaviors", "ChoosingStart", { instant: false });

    expect(roster.syncAvatarBehaviorComponent(renderer, { needsInput: false }, { previousNeedsInput: "true" })).toBe(0);
    expect(playComponent).toHaveBeenCalledWith("playerAvatarBehaviors", "ChoosingEnd", { instant: false });

    for (const call of playComponent.mock.calls) expect(call[2]).not.toHaveProperty("complete");

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
      stopAtComponent: vi.fn((componentId: string, animation: string) => {
        order.push(`stop:${componentId}:${animation}`);
        return 0;
      })
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
    ).toBe(0);

    const [renderedComponents, , renderOptions] = renderer.render.mock.calls[0];
    expect(renderedComponents[0]).toMatchObject({
      id: "player-answer-bubble-mc",
      defaultAnimationState: "Park"
    });
    expect(renderOptions).not.toHaveProperty("timeline");
    expect(order).toEqual([
      "render",
      "stop:avatar:Rex",
      "stop:playerAvatarBehaviors:Default",
      "playerAvatarMC:Appear",
      "playerNameMC:Appear"
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
    expect(host.dataset.visualVisible).toBe("true");
    expect(playComponent).toHaveBeenCalledWith("playerAvatarMC", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("playerNameMC", "Appear", { instant: false });
    expect(playComponent).toHaveBeenCalledWith("vipMC", "Appear", { instant: false });

    playComponent.mockClear();
    expect(roster.setShown(false, { instant: true })).toBe(0);
    expect(host.dataset.visualVisible).toBe("false");
    expect(playComponent).toHaveBeenCalledWith("playerAvatarMC", "Off", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("playerNameMC", "Off", { instant: true });
    expect(playComponent).toHaveBeenCalledWith("vipMC", "Off", { instant: true });
  });

  it("waits only for each player avatar MC when changing player visibility", async () => {
    const tiles = ["p1", "p2"].map((playerId) => ({
      dataset: { playerId, playerObjectCompositionId: PLAYER_WIDGET_COMPOSITION_ID }
    })) as unknown as HTMLElement[];
    const host = {
      classList: { add: vi.fn(), contains: vi.fn(() => true), remove: vi.fn(), toggle: vi.fn() },
      dataset: { visualVisible: "false" },
      offsetWidth: 0,
      querySelectorAll: () => tiles
    } as unknown as HTMLElement;
    const avatarCompletions: Array<() => void> = [];
    const roster = PartyGamePlayerRoster.createRenderer({ host });
    for (const tile of tiles) {
      roster.tilePlayers.set(tile, { id: tile.dataset.playerId, isVip: true });
      roster.tileRenderers.set(tile, {
        render: vi.fn(),
        playComponent: vi.fn((componentId, _animation, options) => {
          if (componentId === "playerAvatarMC") avatarCompletions.push(options?.complete as () => void);
          else expect(options).not.toHaveProperty("complete");
          return 300;
        })
      });
    }
    const complete = vi.fn();

    expect(roster.setShown(true, { complete })).toBe(300);
    expect(avatarCompletions).toHaveLength(2);
    avatarCompletions[0]();
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
    avatarCompletions[1]();
    await Promise.resolve();
    await Promise.resolve();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("renders point popup prefabs with a Popup timeline fallback when no authored timeline exists", () => {
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
      "Popup"
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
    let finishTimeline: () => void = () => {};
    const playAll = vi.fn((_animation: string, options?: Record<string, unknown>) => {
      finishTimeline = (options?.complete as (() => void) | undefined) || (() => {});
      return 250;
    });
    const dispose = vi.fn();
    const roster = PartyGamePlayerRoster.createRenderer({});
    roster.pointPopupRenderers.set(node as unknown as HTMLElement, { render: vi.fn(), playAll, dispose });

    expect(roster.playPointPopup(node as unknown as HTMLElement, { id: "popup-1" })).toBe(250);

    expect((node as { removedClass?: string }).removedClass).toBe("point-popup-hidden");
    expect(playAll).toHaveBeenCalledWith("Popup", { instant: false, complete: expect.any(Function) });
    expect((node as { removed?: boolean }).removed).not.toBe(true);
    finishTimeline();
    expect(dispose).toHaveBeenCalledOnce();
    expect((node as { removed?: boolean }).removed).toBe(true);
  });

  it("cancels and destroys active point popups immediately during teardown", () => {
    const dispose = vi.fn();
    const node = {
      remove: vi.fn()
    } as unknown as HTMLElement;
    const roster = PartyGamePlayerRoster.createRenderer({});
    roster.pointPopupRenderers.set(node, { render: vi.fn(), dispose });

    roster.disposePointPopup(node);

    expect(dispose).toHaveBeenCalledOnce();
    expect(node.remove).toHaveBeenCalledOnce();
    expect(roster.pointPopupRenderers.has(node)).toBe(false);
  });
});
