import { describe, expect, it } from "vitest";
import {
  PartyGameVotingCardVisuals,
  VOTING_CARD_ANSWER_MC_ID,
  VOTING_CARD_VOTER_COMPONENT_ID,
  VOTING_CARD_VOTER_ID,
  VOTING_CARD_VOTER_MC_ID,
  VOTING_CARD_VOTER_TEXT_ID,
  VOTING_CARD_VOTERS_MC_ID,
  runtimeVotingCardComposition,
  votingCardRuntimeBaseCompositionId,
  votingCardArtTimeline
} from "./stageVotingCardVisuals";

describe("PartyGameVotingCardVisuals (ported voting-card-visuals)", () => {
  it("createRenderer returns the render surface", () => {
    const renderer = PartyGameVotingCardVisuals.createRenderer({});
    expect(renderer.render).toBeTypeOf("function");
    expect(renderer.clear).toBeTypeOf("function");
  });

  it("render is a no-op without a layer", () => {
    const renderer = PartyGameVotingCardVisuals.createRenderer({});
    expect(() => renderer.render([{ id: "c1" }])).not.toThrow();
    expect(renderer.cards.size).toBe(0);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameVotingCardVisuals?: unknown };
    expect(host.PartyGameVotingCardVisuals).toBeTypeOf("object");
  });

  it("uses effective timelines for voting card art renderers", () => {
    const timeline = {
      fps: 30,
      frameCount: 2,
      labels: [{ name: "custom", frame: 1 }],
      commands: [{ frame: 1, type: "stop" }],
      tracks: []
    };

    expect(votingCardArtTimeline(timeline).labels).toEqual([expect.objectContaining({ name: "custom", frame: 1 })]);
    expect(votingCardArtTimeline(null).labels.map((label) => label.name)).toEqual(expect.arrayContaining(["Appear", "Disappear"]));
  });

  it("injects runtime answer text without changing the authored child prefab", () => {
    const authored = {
      canvas: { width: 420, height: 78 },
      components: [{ id: "voting-card-answer-text", kind: "text", defaultText: "ANSWER" }]
    };
    const runtime = runtimeVotingCardComposition(authored, VOTING_CARD_ANSWER_MC_ID, {
      answerText: "DINOSAUR PARK",
      authorText: "Ava",
      voteCount: 0,
      voters: []
    });

    expect(authored.components[0].defaultText).toBe("ANSWER");
    expect((runtime.components as Record<string, unknown>[])[0].defaultText).toBe("DINOSAUR PARK");
  });

  it("expands the voter template into independently animated prefab references", () => {
    const authored = {
      canvas: { width: 500, height: 48 },
      components: [
        {
          id: "voting-card-voter-container",
          kind: "container",
          children: [{ id: VOTING_CARD_VOTER_COMPONENT_ID, kind: "reference", artCompositionId: VOTING_CARD_VOTER_MC_ID }]
        }
      ]
    };
    const runtime = runtimeVotingCardComposition(authored, VOTING_CARD_VOTERS_MC_ID, {
      answerText: "",
      authorText: "",
      voteCount: 2,
      voters: [{ id: "p1", name: "Ava" }, { id: "p2", name: "Max" }]
    });
    const container = (runtime.components as Record<string, unknown>[])[0];

    expect(container.children).toEqual([
      expect.objectContaining({ id: "voting-card-voter-mc-p1", instanceLabel: "vote1", kind: "reference", artCompositionId: `${VOTING_CARD_VOTER_MC_ID}::p1`, defaultAnimationState: "Off" }),
      expect.objectContaining({ id: "voting-card-voter-mc-p2", instanceLabel: "vote2", kind: "reference", artCompositionId: `${VOTING_CARD_VOTER_MC_ID}::p2`, defaultAnimationState: "Off" })
    ]);
  });

  it("resolves each spawned voter through a private wrapper and injects its name at the base layer", () => {
    const state = {
      answerText: "",
      authorText: "",
      voteCount: 1,
      voters: [{ id: "p1", name: "Ava" }]
    };
    const wrapper = {
      canvas: { width: 112, height: 32 },
      components: [{ id: "voter-ref", kind: "reference", artCompositionId: VOTING_CARD_VOTER_ID }],
      timeline: { fps: 30, frameCount: 2, labels: [], commands: [], tracks: [] }
    };
    const base = {
      canvas: { width: 112, height: 32 },
      components: [{ id: VOTING_CARD_VOTER_TEXT_ID, kind: "text", defaultText: "PLAYER" }],
      timeline: {
        fps: 30,
        frameCount: 1,
        labels: [{ name: "Default", frame: 0 }],
        commands: [{ id: "stop-0", frame: 0, type: "stop" }],
        tracks: [{ targetId: VOTING_CARD_VOTER_TEXT_ID, keyframes: [{ frame: 0, props: { defaultText: "PLAYER" } }] }]
      }
    };

    const runtimeWrapper = runtimeVotingCardComposition(wrapper, `${VOTING_CARD_VOTER_MC_ID}::p1`, state);
    const runtimeBase = runtimeVotingCardComposition(base, `${VOTING_CARD_VOTER_ID}::p1`, state);

    expect(votingCardRuntimeBaseCompositionId(`${VOTING_CARD_VOTER_MC_ID}::p1`)).toBe(VOTING_CARD_VOTER_MC_ID);
    expect((runtimeWrapper.components as Record<string, unknown>[])[0].artCompositionId).toBe(`${VOTING_CARD_VOTER_ID}::p1`);
    expect((runtimeBase.components as Record<string, unknown>[])[0].defaultText).toBe("Ava");
    expect((((runtimeBase.timeline as Record<string, unknown>).tracks as Record<string, unknown>[])[0].keyframes as Record<string, unknown>[])[0].props).toEqual({ defaultText: "Ava" });
    expect((base.components as Record<string, unknown>[])[0].defaultText).toBe("PLAYER");
  });
});
