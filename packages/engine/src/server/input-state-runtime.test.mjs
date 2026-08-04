import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createInputStateRuntime,
  playerIsControllerInputRecipient,
  setControllerInputRecipients
} = require("./input-state-runtime");
const {
  markPlayerControllerConnected,
  markPlayerControllerDisconnected
} = require("./player-presence-runtime");

describe("controller input recipient availability", () => {
  it("snapshots recipients, excludes late joiners, and restores a recipient on reconnect", () => {
    const one = { id: "p1", joined: true, active: true, controllerConnected: true };
    const two = { id: "p2", joined: true, active: true, controllerConnected: true };
    const room = {
      players: new Map([[one.id, one], [two.id, two]]),
      choiceInputActionId: "choice",
      choiceInputAnswers: new Map([[one.id, { done: true }]])
    };
    const runtime = createInputStateRuntime({ joinedPlayers: (value) => [...value.players.values()] });
    setControllerInputRecipients(room, [one, two]);

    const late = { id: "late", joined: true, active: true, controllerConnected: true };
    room.players.set(late.id, late);
    expect(playerIsControllerInputRecipient(room, late.id)).toBe(false);
    expect(runtime.allInputRecipientsHaveSubmitted(room)).toBe(false);

    markPlayerControllerDisconnected(two);
    expect(runtime.playerDisconnected(room, two.id)).toBe(true);
    markPlayerControllerConnected(two);
    expect(runtime.playerReconnected(room, two.id)).toBe(true);
    expect(runtime.allInputRecipientsHaveSubmitted(room)).toBe(false);

    room.choiceInputAnswers.set(two.id, { done: true });
    expect(runtime.allInputRecipientsHaveSubmitted(room)).toBe(true);
  });
});
