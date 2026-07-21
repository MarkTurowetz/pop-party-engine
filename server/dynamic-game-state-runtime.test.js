import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  applyDynamicGameStateCode,
  evaluateCodeExpression,
  splitStatements
} = require("./dynamic-game-state-runtime");

describe("dynamic game-state code nodes", () => {
  it("evaluates G-variable arithmetic with standard precedence", () => {
    expect(evaluateCodeExpression({ a: 2, b: 5 }, "g.a + g.b * 3")).toBe(17);
    expect(evaluateCodeExpression({ a: 2, b: 5 }, "(g.a + g.b) * 3")).toBe(21);
  });

  it("supports increment, decrement, compound assignments, and combined totals", () => {
    const room = {};
    const result = applyDynamicGameStateCode(room, `
      g.test = 0;
      g.secondVariable = 4;
      g.test++;
      g.combinedTotal = g.test + g.secondVariable;
      g.test += 5;
      --g.test;
      g.secondVariable *= 3;
      g.secondVariable /= 2;
    `);

    expect(result).toMatchObject({ statements: 8, applied: 8, errors: [] });
    expect(room.G).toEqual({
      test: 5,
      secondVariable: 6,
      combinedTotal: 5
    });
  });

  it("supports subtraction, remainder, exponentiation, unary values, and string addition", () => {
    const room = {};
    const result = applyDynamicGameStateCode(room, `
      g.total = 10;
      g.total -= 3;
      g.total %= 4;
      g.power = 2 ** 3;
      g.negative = -(g.power + 1);
      g.label = "Round " + g.total;
    `);

    expect(result.errors).toEqual([]);
    expect(room.G).toEqual({ total: 3, power: 8, negative: -9, label: "Round 3" });
  });

  it("keeps semicolons inside strings and JSON values inside one statement", () => {
    expect(splitStatements(`g.label = "a;b"; g.data = {"value": 2}`)).toEqual([
      `g.label = "a;b"`,
      `g.data = {"value": 2}`
    ]);
    const room = {};
    applyDynamicGameStateCode(room, `g.label = "a;b"; g.data = {"value": 2}`);
    expect(room.G).toEqual({ label: "a;b", data: { value: 2 } });
  });

  it("reports invalid variables and blocks prototype paths without mutating them", () => {
    const room = { G: { test: 1 } };
    const result = applyDynamicGameStateCode(
      room,
      "g.total = g.missing + 1; g.__proto__.polluted = true"
    );

    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(room.G).toEqual({ test: 1 });
    expect({}.polluted).toBeUndefined();
  });
});
