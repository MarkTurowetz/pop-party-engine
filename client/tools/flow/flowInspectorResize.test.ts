import { describe, expect, it } from "vitest";
import {
  clampFlowInspectorWidth,
  defaultFlowInspectorWidth,
  flowInspectorStorageKey,
  readStoredFlowInspectorWidth,
  storeFlowInspectorWidth
} from "./flowInspectorResize";

describe("flow inspector resizing", () => {
  it("clamps the inspector while preserving room for the node canvas", () => {
    expect(clampFlowInspectorWidth(250)).toBe(320);
    expect(clampFlowInspectorWidth(1200)).toBe(900);
    expect(clampFlowInspectorWidth(700, 900)).toBe(544);
  });

  it("loads and persists the user's inspector width", () => {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      }
    } satisfies Storage;

    expect(readStoredFlowInspectorWidth(storage)).toBe(defaultFlowInspectorWidth);
    storeFlowInspectorWidth(640, storage);
    expect(values.get(flowInspectorStorageKey)).toBe("640");
    expect(readStoredFlowInspectorWidth(storage)).toBe(640);
  });
});
