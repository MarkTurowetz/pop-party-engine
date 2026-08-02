import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createPlayerPublicRuntime } = require("./player-public-runtime");

describe("player public runtime", () => {
  it("includes authoritative plugin-input recipient and submission status in needsInput", () => {
    const { publicPlayer } = createPlayerPublicRuntime({ choiceInputPayload: () => null });
    const action = { id: "plugin-input" };
    const room = {
      gamePluginInputActionId: "plugin-input",
      gamePluginInputRecipientIds: new Set(["p1", "p2"]),
      gamePluginInputSubmissions: new Map([["p2", { choice: "done" }]])
    };

    expect(publicPlayer({ id: "p1", active: true }, room, action).needsInput).toBe(true);
    expect(publicPlayer({ id: "p2", active: true }, room, action).needsInput).toBe(false);
    expect(publicPlayer({ id: "p3", active: true }, room, action).needsInput).toBe(false);
    expect(publicPlayer({ id: "p1", active: false }, room, action).needsInput).toBe(false);
  });
});
