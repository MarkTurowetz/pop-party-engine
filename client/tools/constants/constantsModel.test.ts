import { describe, expect, it } from "vitest";
import { normalizeCustomConstantValue, normalizeGameConstants } from "./constantsModel";

describe("constantsModel", () => {
  it("normalizes built-in constants with clamping and defaults", () => {
    const normalized = normalizeGameConstants({ numberOfRounds: 500, gameTitle: "  My Game  ", craftingTimerDuration: 5000 });
    expect(normalized.numberOfRounds).toBe(99);
    expect(normalized.gameTitle).toBe("My Game");
    expect(normalized.craftingTimerDuration).toBe(3600);
    expect(normalized.playerColors.length).toBeGreaterThan(0);
  });

  it("normalizes custom constant values by type", () => {
    expect(normalizeCustomConstantValue("12.7", "int")).toBe(12);
    expect(normalizeCustomConstantValue("3.14159", "float")).toBe(3.1416);
    expect(normalizeCustomConstantValue("true", "bool")).toBe(true);
    expect(normalizeCustomConstantValue("a, b\nc", "list")).toEqual(["a", "b", "c"]);
    expect(normalizeCustomConstantValue("  hi  ", "string")).toBe("hi");
  });

  it("applies custom constants onto the top-level object and dedupes ids", () => {
    const normalized = normalizeGameConstants({
      customConstants: [
        { id: "myFlag", name: "My Flag", type: "bool", value: true },
        { id: "gameTitle", name: "Collides", type: "string", value: "x" } // reserved id -> renamed
      ]
    });
    expect((normalized as Record<string, unknown>).myFlag).toBe(true);
    expect(normalized.customConstants[0].id).toBe("myFlag");
    expect(normalized.customConstants[1].id).not.toBe("gameTitle");
  });
});
