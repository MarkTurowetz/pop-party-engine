import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  applyLogValueAction,
  formatDebugValue
} = require("./debug-log-runtime");

describe("debug log runtime", () => {
  it("evaluates local Flow values and stores a stage-safe debug message", () => {
    const room = {
      G: {},
      localVariables: { bidResponse: "I can't believe you bid more than 30!" }
    };

    expect(applyLogValueAction(room, {
      id: "log-bid",
      type: "logValue",
      value: "l.bidResponse"
    })).toEqual({
      actionId: "log-bid",
      expression: "l.bidResponse",
      valueText: "I can't believe you bid more than 30!",
      message: "l.bidResponse = I can't believe you bid more than 30!",
      sequence: 1,
      error: ""
    });
  });

  it("formats objects, missing values, and safe expressions without mutating Flow state", () => {
    const room = {
      G: { bid: 31, player: { id: "p1" } },
      localVariables: { bonus: 2 }
    };

    expect(formatDebugValue(room.G.player)).toBe('{"id":"p1"}');
    expect(applyLogValueAction(room, { value: "g.bid + l.bonus" }).valueText).toBe("33");
    expect(applyLogValueAction(room, { value: "l.missing" }).valueText).toBe("undefined");
    expect(room.G).toEqual({ bid: 31, player: { id: "p1" } });
    expect(room.localVariables).toEqual({ bonus: 2 });
  });

  it("shows malformed expressions as debug output instead of crashing the room", () => {
    const room = { G: {}, localVariables: {} };

    const result = applyLogValueAction(room, { value: "g.value ?? nope" });

    expect(result.valueText).toMatch(/^\[evaluation error:/);
    expect(result.error).toMatch(/Unsupported expression token/);
    expect(room.runtimeFault).toBeUndefined();
  });
});
