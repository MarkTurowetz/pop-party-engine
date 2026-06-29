import { describe, expect, it } from "vitest";
import { createControllerModuleCache } from "./controllerModuleCache";
import { createControllerViewState } from "./controllerViewState";

function fakeElement(): HTMLElement {
  const classes = new Set<string>();
  return {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, force?: boolean) => {
        const next = force === undefined ? !classes.has(c) : force;
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      }
    }
  } as unknown as HTMLElement;
}

function hidden(element: HTMLElement): boolean {
  return element.classList.contains("hidden");
}

describe("createControllerModuleCache (ported)", () => {
  it("memoizes the factory per key", () => {
    const cache = createControllerModuleCache();
    let calls = 0;
    const make = () => ({ id: ++calls });
    const first = cache.get("a", make);
    const second = cache.get("a", make);
    const other = cache.get("b", make);
    expect(first).toBe(second);
    expect(other).not.toBe(first);
    expect(calls).toBe(2);
  });
});

describe("createControllerViewState (ported)", () => {
  it("hideAll / show / setShown toggle the hidden class", () => {
    const a = fakeElement();
    const b = fakeElement();
    const state = createControllerViewState({ a, b });
    state.hideAll();
    expect(hidden(a)).toBe(true);
    expect(hidden(b)).toBe(true);
    expect(state.show("a")).toBe(a);
    expect(hidden(a)).toBe(false);
    state.setShown("a", false);
    expect(hidden(a)).toBe(true);
    expect(state.show("missing")).toBe(null);
    expect(state.view("b")).toBe(b);
  });
});
