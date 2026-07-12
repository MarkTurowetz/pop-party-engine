import { describe, expect, it } from "vitest";
import { canonicalLifecycleLabel, lifecycleLabelsMatch } from "./lifecycle-labels";

describe("lifecycle label compatibility", () => {
  it("accepts canonical names and only the exact lowercase legacy aliases", () => {
    expect(canonicalLifecycleLabel("Appear")).toBe("Appear");
    expect(canonicalLifecycleLabel("appear")).toBe("Appear");
    expect(canonicalLifecycleLabel("aPpear")).toBeNull();
    expect(canonicalLifecycleLabel("APPEAR")).toBeNull();
    expect(lifecycleLabelsMatch("appear", "Appear")).toBe(true);
    expect(lifecycleLabelsMatch("custom", "Custom")).toBe(false);
  });
});
