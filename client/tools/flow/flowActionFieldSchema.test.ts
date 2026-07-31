import { describe, expect, it } from "vitest";
import { actionFieldsForType } from "./flowActionFieldSchema";

describe("Flow action field schema", () => {
  it("exposes the Log Value expression in the inspector", () => {
    expect(actionFieldsForType("logValue")).toEqual([
      { key: "value", label: "Variable / Value", control: "text" }
    ]);
  });
});
