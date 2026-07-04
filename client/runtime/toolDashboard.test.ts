import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = (event?: Event) => unknown;

interface DashboardHarness {
  button: HTMLButtonElement;
  clickSaveAll: () => Promise<void>;
  registerDashboardTool: typeof import("./toolDashboard").registerDashboardTool;
  setupToolDashboard: () => void;
}

function classListStub(): DOMTokenList {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(),
    item: vi.fn(),
    replace: vi.fn(),
    supports: vi.fn(),
    toggle: vi.fn(),
    value: "",
    length: 0,
    entries: vi.fn(),
    forEach: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    [Symbol.iterator]: vi.fn()
  } as unknown as DOMTokenList;
}

async function createDashboardHarness(): Promise<DashboardHarness> {
  vi.resetModules();
  const listeners = new Map<string, Listener>();
  const button = {
    addEventListener: vi.fn((type: string, listener: Listener) => listeners.set(type, listener)),
    dataset: {},
    disabled: true,
    textContent: "Save All"
  } as unknown as HTMLButtonElement;
  const globals = globalThis as Record<string, unknown>;
  globals.document = {
    body: { classList: classListStub() },
    querySelector: vi.fn(() => null)
  } as unknown as Document;
  globals.window = {
    confirm: vi.fn(() => true),
    location: { search: "" }
  };
  globals.globalSaveButton = button;
  globals.toolDashboardBar = { classList: classListStub() } as unknown as HTMLElement;
  globals.toolTabs = [];

  const dashboard = await import("./toolDashboard");
  const setupToolDashboard = (globals.window as { setupToolDashboard?: () => void }).setupToolDashboard;
  if (!setupToolDashboard) throw new Error("setupToolDashboard was not installed");

  return {
    button,
    clickSaveAll: async () => {
      const listener = listeners.get("click");
      if (listener) await listener();
    },
    registerDashboardTool: dashboard.registerDashboardTool,
    setupToolDashboard
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  const globals = globalThis as Record<string, unknown>;
  delete globals.document;
  delete globals.window;
  delete globals.globalSaveButton;
  delete globals.toolDashboardBar;
  delete globals.toolTabs;
  delete globals.activeToolId;
  delete globals.setupToolDashboard;
});

describe("toolDashboard Save All", () => {
  it("keeps Save All clickable even when no tools are dirty", async () => {
    const harness = await createDashboardHarness();
    const save = vi.fn();
    harness.registerDashboardTool("flow", {
      isDirty: () => false,
      save,
      setup: vi.fn()
    });

    harness.setupToolDashboard();

    expect(harness.button.disabled).toBe(false);
    expect(harness.button.dataset.dashboardDirty).toBe("false");
    await harness.clickSaveAll();
    expect(save).not.toHaveBeenCalled();
    expect(harness.button.disabled).toBe(false);
  });

  it("disables Save All only while saving dirty tools", async () => {
    const harness = await createDashboardHarness();
    let finishSave = () => {};
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    harness.registerDashboardTool("flow", {
      isDirty: () => true,
      save,
      setup: vi.fn()
    });

    harness.setupToolDashboard();
    const savePromise = harness.clickSaveAll();

    expect(save).toHaveBeenCalledTimes(1);
    expect(harness.button.disabled).toBe(true);
    expect(harness.button.textContent).toBe("Saving");

    finishSave();
    await savePromise;

    expect(harness.button.disabled).toBe(false);
    expect(harness.button.textContent).toBe("Save All");
  });
});
