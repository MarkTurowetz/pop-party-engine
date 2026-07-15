import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  IDS,
  migratePlayerAnswerBubbleStates
} = require("./migrate-player-answer-bubble-states.js");

function fixture() {
  const votingText = { id: "voting-text", kind: "text" };
  const votingBackground = { id: "voting-background", kind: "shape" };
  const states = [
    { fillColor: "#fff8d6", fontColor: "#17131f" },
    { fillColor: "#8dff5f", fontColor: "#181f13" },
    { fillColor: "#ff5c45", fontColor: "#17131f" }
  ];
  return {
    compositions: {
      "voting-answer": {
        name: "Voting Card Answer Text",
        components: [votingText, votingBackground],
        timeline: {
          labels: [
            { name: "Default", frame: 0 },
            { name: "Correct", frame: 1 },
            { name: "Incorrect", frame: 2 }
          ],
          tracks: [
            {
              targetId: votingText.id,
              keyframes: states.map((state, frame) => ({
                frame,
                props: { fontColor: state.fontColor }
              }))
            },
            {
              targetId: votingBackground.id,
              keyframes: states.map((state, frame) => ({
                frame,
                props: { fillColor: state.fillColor }
              }))
            }
          ]
        }
      },
      [IDS.bubble]: {
        name: "Player Answer Bubble",
        components: [
          {
            id: IDS.text,
            kind: "text",
            x: 150,
            y: 92,
            width: 200,
            height: 78,
            scale: 1,
            defaultText: "ANSWER",
            fontFamily: "ui-rounded",
            fontSize: 28,
            fontColor: "#000000"
          },
          {
            id: IDS.card,
            kind: "shape",
            x: 150,
            y: 92,
            width: 220,
            height: 105,
            scale: 1,
            fillColor: "#ffffff",
            borderColor: "#17131f",
            borderWidth: 3,
            borderRadius: 18
          },
          {
            id: IDS.tail,
            kind: "shape",
            x: 150,
            y: 153,
            width: 24,
            height: 24,
            scale: 1,
            rotation: 45,
            fillColor: "#ffffff",
            borderColor: "#17131f",
            borderWidth: 3,
            borderRadius: 3
          }
        ],
        timeline: {
          labels: [
            { name: "Off", frame: 0 },
            { name: "Appear", frame: 2 }
          ],
          commands: [{ frame: 0, type: "setVisible", target: "false" }]
        }
      },
      "bubble-mc": {
        name: "Player Answer Bubble MC",
        components: [
          {
            id: "bubble-reference",
            kind: "reference",
            artCompositionId: IDS.bubble,
            defaultAnimationState: ""
          }
        ],
        timeline: {
          labels: [
            { name: "Off", frame: 0 },
            { name: "Appear", frame: 2 }
          ]
        }
      }
    }
  };
}

describe("migratePlayerAnswerBubbleStates", () => {
  it("gives the base bubble exactly three stopped semantic states", () => {
    const result = migratePlayerAnswerBubbleStates(fixture(), "2026-07-15T00:00:00.000Z");
    const bubble = result.compositions[IDS.bubble];

    expect(bubble.timeline.labels).toEqual([
      { name: "Default", frame: 0 },
      { name: "Correct", frame: 1 },
      { name: "Incorrect", frame: 2 }
    ]);
    expect(bubble.timeline.commands).toEqual([
      { id: "stop-0", frame: 0, type: "stop" },
      { id: "stop-1", frame: 1, type: "stop" },
      { id: "stop-2", frame: 2, type: "stop" }
    ]);
    expect(bubble.timeline.commands.some((command) => command.type === "setVisible")).toBe(false);
  });

  it("copies the Voting Card fill and text colors onto the card and tail", () => {
    const result = migratePlayerAnswerBubbleStates(fixture(), "2026-07-15T00:00:00.000Z");
    const tracks = Object.fromEntries(
      result.compositions[IDS.bubble].timeline.tracks.map((track) => [track.targetId, track])
    );

    expect(tracks[IDS.card].keyframes.map((keyframe) => keyframe.props.fillColor)).toEqual([
      "#fff8d6",
      "#8dff5f",
      "#ff5c45"
    ]);
    expect(tracks[IDS.tail].keyframes.map((keyframe) => keyframe.props.fillColor)).toEqual([
      "#fff8d6",
      "#8dff5f",
      "#ff5c45"
    ]);
    expect(tracks[IDS.text].keyframes.map((keyframe) => keyframe.props.fontColor)).toEqual([
      "#17131f",
      "#181f13",
      "#17131f"
    ]);
  });

  it("keeps lifecycle animation in the wrapper and defaults its child to Default", () => {
    const source = fixture();
    const wrapperTimeline = structuredClone(source.compositions["bubble-mc"].timeline);
    const result = migratePlayerAnswerBubbleStates(source, "2026-07-15T00:00:00.000Z");

    expect(result.compositions["bubble-mc"].timeline).toEqual(wrapperTimeline);
    expect(result.compositions["bubble-mc"].components[0].defaultAnimationState).toBe("Default");
    expect(
      result.compositions[IDS.bubble].components.every(
        (component) => component.defaultAnimationState === "Default"
      )
    ).toBe(true);
  });

  it("does not mutate the source manifest", () => {
    const source = fixture();
    migratePlayerAnswerBubbleStates(source, "2026-07-15T00:00:00.000Z");

    expect(source.compositions[IDS.bubble].timeline.labels.map((label) => label.name)).toEqual([
      "Off",
      "Appear"
    ]);
    expect(source.compositions["bubble-mc"].components[0].defaultAnimationState).toBe("");
  });
});
