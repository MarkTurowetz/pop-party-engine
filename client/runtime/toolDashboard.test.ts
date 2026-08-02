import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = (event?: Event) => unknown;

interface DashboardHarness {
  button: HTMLButtonElement;
  clickRestoreGit: () => Promise<void>;
  clickSaveAll: () => Promise<void>;
  clickSyncNow: () => Promise<void>;
  pressSaveAllHotkey: () => Promise<{ prevented: boolean }>;
  registerDashboardWorkspaceActions: typeof import("./toolDashboard").registerDashboardWorkspaceActions;
  registerDashboardTool: typeof import("./toolDashboard").registerDashboardTool;
  restoreButton: HTMLButtonElement;
  setupToolDashboard: () => void;
  status: HTMLElement;
  syncButton: HTMLButtonElement;
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
  const buttonListeners = new Map<string, Listener>();
  const documentListeners = new Map<string, Listener>();
  const button = {
    addEventListener: vi.fn((type: string, listener: Listener) => buttonListeners.set(type, listener)),
    dataset: {},
    disabled: true,
    textContent: "Save All"
  } as unknown as HTMLButtonElement;
  const syncButton = {
    addEventListener: vi.fn((type: string, listener: Listener) => buttonListeners.set(`sync:${type}`, listener)),
    disabled: false,
    textContent: "Sync Now"
  } as unknown as HTMLButtonElement;
  const restoreButton = {
    addEventListener: vi.fn((type: string, listener: Listener) => buttonListeners.set(`restore:${type}`, listener)),
    disabled: false,
    textContent: "Restore from Git"
  } as unknown as HTMLButtonElement;
  const status = {
    classList: classListStub(),
    textContent: ""
  } as unknown as HTMLElement;
  const globals = globalThis as Record<string, unknown>;
  globals.document = {
    addEventListener: vi.fn((type: string, listener: Listener) => documentListeners.set(type, listener)),
    body: { classList: classListStub() },
    querySelector: vi.fn(() => null)
  } as unknown as Document;
  globals.window = {
    addEventListener: vi.fn(),
    confirm: vi.fn(() => true),
    location: { reload: vi.fn(), search: "" }
  };
  globals.globalSaveButton = button;
  globals.globalSyncButton = syncButton;
  globals.globalRestoreGitButton = restoreButton;
  globals.globalSaveStatus = status;
  globals.toolDashboardBar = { classList: classListStub() } as unknown as HTMLElement;
  globals.toolTabs = [];

  const dashboard = await import("./toolDashboard");
  const setupToolDashboard = (globals.window as { setupToolDashboard?: () => void }).setupToolDashboard;
  if (!setupToolDashboard) throw new Error("setupToolDashboard was not installed");

  return {
    button,
    clickRestoreGit: async () => {
      const listener = documentListeners.get("click");
      if (listener) await listener({ target: restoreButton } as unknown as MouseEvent);
      await Promise.resolve();
    },
    clickSaveAll: async () => {
      const listener = documentListeners.get("click");
      if (listener) await listener({ target: button } as unknown as MouseEvent);
    },
    clickSyncNow: async () => {
      const listener = documentListeners.get("click");
      if (listener) await listener({ target: syncButton } as unknown as MouseEvent);
      await Promise.resolve();
    },
    pressSaveAllHotkey: async () => {
      let prevented = false;
      const listener = documentListeners.get("keydown");
      if (listener) {
        await listener({
          ctrlKey: false,
          key: "S",
          metaKey: true,
          preventDefault: () => {
            prevented = true;
          },
          shiftKey: true
        } as unknown as KeyboardEvent);
      }
      return { prevented };
    },
    registerDashboardWorkspaceActions: dashboard.registerDashboardWorkspaceActions,
    registerDashboardTool: dashboard.registerDashboardTool,
    restoreButton,
    setupToolDashboard,
    status,
    syncButton
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  const globals = globalThis as Record<string, unknown>;
  delete globals.document;
  delete globals.window;
  delete globals.globalSaveButton;
  delete globals.globalSyncButton;
  delete globals.globalRestoreGitButton;
  delete globals.globalSaveStatus;
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

  it("checkpoints the workspace when all tools are clean so server recovery cannot deadlock", async () => {
    const harness = await createDashboardHarness();
    const workspaceSave = vi.fn(async () => true);
    harness.registerDashboardTool("flow", {
      isDirty: () => false,
      save: vi.fn(),
      setup: vi.fn()
    });
    harness.registerDashboardWorkspaceActions({
      save: workspaceSave,
      sync: vi.fn(async () => true),
      restore: vi.fn(async () => true)
    });

    harness.setupToolDashboard();
    await harness.clickSaveAll();

    expect(workspaceSave).toHaveBeenCalledTimes(1);
    expect(harness.button.textContent).toBe("Save All");
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

  it("handles Save through the document so a live control cannot lose its binding", async () => {
    const harness = await createDashboardHarness();
    const save = vi.fn(async () => true);
    harness.registerDashboardTool("flow", {
      isDirty: () => true,
      save,
      setup: vi.fn()
    });

    harness.setupToolDashboard();
    await harness.clickSaveAll();

    expect(save).toHaveBeenCalledTimes(1);
    expect((globalThis.document as unknown as {
      addEventListener: ReturnType<typeof vi.fn>;
    }).addEventListener).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("keeps a rejected save visible instead of reporting a false success", async () => {
    const harness = await createDashboardHarness();
    harness.registerDashboardTool("art", {
      getError: () => "GitHub returned a stale draft",
      isDirty: () => true,
      save: vi.fn(async () => false),
      setup: vi.fn()
    });

    harness.setupToolDashboard();
    await harness.clickSaveAll();

    expect(harness.button.disabled).toBe(false);
    expect(harness.button.dataset.saveError).toBe("true");
    expect(harness.button.textContent).toBe("Save failed");
    expect(harness.button.title).toContain("GitHub returned a stale draft");
    expect(harness.status.textContent).toContain("GitHub returned a stale draft");
  });

  it("treats a null controller result as a visible failed save", async () => {
    const harness = await createDashboardHarness();
    harness.registerDashboardTool("flow", {
      getError: () => "Draft revision conflict",
      isDirty: () => true,
      save: vi.fn(async () => null),
      setup: vi.fn()
    });

    harness.setupToolDashboard();
    await harness.clickSaveAll();

    expect(harness.button.dataset.saveError).toBe("true");
    expect(harness.status.textContent).toContain("Draft revision conflict");
  });

  it("commits a focused inspector field before checking dirty tools", async () => {
    const harness = await createDashboardHarness();
    let dirty = false;
    const save = vi.fn(async () => true);
    (globalThis.document as unknown as { activeElement: { blur: () => void } }).activeElement = {
      blur: () => { dirty = true; }
    };
    harness.registerDashboardTool("art", { isDirty: () => dirty, save, setup: vi.fn() });

    harness.setupToolDashboard();
    await harness.clickSaveAll();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves dirty tools from Command Shift S", async () => {
    const harness = await createDashboardHarness();
    const save = vi.fn();
    harness.registerDashboardTool("flow", {
      isDirty: () => true,
      save,
      setup: vi.fn()
    });

    harness.setupToolDashboard();
    const result = await harness.pressSaveAllHotkey();

    expect(result.prevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("runs an explicit Git sync without requiring dirty tool state", async () => {
    const harness = await createDashboardHarness();
    const sync = vi.fn(async () => undefined);
    harness.registerDashboardWorkspaceActions({
      save: vi.fn(async () => undefined),
      sync,
      restore: vi.fn(async () => undefined)
    });
    harness.setupToolDashboard();

    await harness.clickSyncNow();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(harness.syncButton.disabled).toBe(false);
  });

  it("confirms and reloads after Restore from Git completes", async () => {
    const harness = await createDashboardHarness();
    const restore = vi.fn(async () => undefined);
    harness.registerDashboardWorkspaceActions({
      save: vi.fn(async () => undefined),
      sync: vi.fn(async () => undefined),
      restore
    });
    harness.setupToolDashboard();

    await harness.clickRestoreGit();

    expect(restore).toHaveBeenCalledTimes(1);
    expect((globalThis.window as unknown as { location: { reload: ReturnType<typeof vi.fn> } }).location.reload)
      .toHaveBeenCalledTimes(1);
  });
});
