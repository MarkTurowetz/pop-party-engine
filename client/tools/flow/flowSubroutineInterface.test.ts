import { describe, expect, it } from "vitest";
import {
  createSubroutineInput,
  createSubroutineOutput,
  normalizeSubroutineVariableName,
  renameSubroutineInterfaceItem
} from "./flowSubroutineInterface";

describe("flow subroutine interface model", () => {
  it("creates caller/local defaults with unique names", () => {
    const first = createSubroutineInput([]);
    const second = createSubroutineInput([first]);
    const output = createSubroutineOutput([]);

    expect(first).toEqual({ name: "input1", valueType: "string", source: "g.input1" });
    expect(second.name).toBe("input2");
    expect(output).toEqual({
      name: "output1",
      valueType: "string"
    });
  });

  it("normalizes and de-duplicates names used as l properties", () => {
    expect(normalizeSubroutineVariableName(" Current Player ", "input")).toBe("CurrentPlayer");
    expect(renameSubroutineInterfaceItem([
      { name: "choice", valueType: "string", source: "l.choice" },
      { name: "score", valueType: "integer", source: "l.score" }
    ], 1, "choice")[1].name).toBe("choice2");
    expect(renameSubroutineInterfaceItem([
      { name: "choice", valueType: "string" },
      { name: "score", valueType: "integer" }
    ], 1, "choice")[1].name).toBe("choice2");
  });
});
