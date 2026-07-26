// Typed port of the legacy client/tool-dashboard.js — the /tools tab router. Defines
// setupToolDashboard (app-shell dispatches it for role "tools"). The per-tool dirty/
// save/setup behaviour is supplied by tools.tsx via registerDashboardTool() — a direct
// registration API that replaced the old window.setupFlowTool/saveGameFlow/isFlowDirty/
// … shim globals. App-shell DOM refs are read via window.

export interface DashboardToolHooks {
  getError?: () => string | null;
  isDirty: () => boolean;
  save: () => Promise<unknown> | unknown;
  setup: () => void | Promise<unknown>;
}

interface ToolMetadata {
  id: string;
  label: string;
  screenId: string;
}

declare global {
  interface Window {
    setupToolDashboard?: () => void;
    artCompositionsPendingDeleteCount?: () => number;
    globalSaveButton?: HTMLButtonElement;
    globalSaveStatus?: HTMLElement;
    unsafeChangesModal?: HTMLElement;
    unsafeCancelButton?: HTMLElement;
    unsafeSaveButton?: HTMLElement;
    toolDashboardBar?: HTMLElement;
    toolTabs?: HTMLElement[];
    activeToolId?: string;
  }
}

const w = () => globalThis as typeof globalThis & Window;

const TOOL_METADATA: ToolMetadata[] = [
  { id: "flow", label: "Flow Tool", screenId: "flowScreen" },
  { id: "host-audio", label: "Host Audios", screenId: "hostAudioScreen" },
  { id: "constants", label: "Game Constants", screenId: "constantsScreen" },
  { id: "art", label: "Art Manager", screenId: "artScreen" },
  { id: "layout", label: "Layout Tool", screenId: "layoutScreen" },
  { id: "controller-layout", label: "Controller Layout Tool", screenId: "layoutScreen" }
];

const toolHooks = new Map<string, DashboardToolHooks>();
let savingAllTools = false;
let dashboardEventsInstalled = false;
let workspaceSave: (() => Promise<unknown>) | null = null;

/** Register a /tools tab's dirty/save/setup behaviour (called by tools.tsx). */
export function registerDashboardTool(id: string, hooks: DashboardToolHooks): void {
  toolHooks.set(id, hooks);
}

export function registerDashboardWorkspaceSave(save: (() => Promise<unknown>) | null): void {
  workspaceSave = save;
}

function metadataFor(toolId: string | null): ToolMetadata | null {
  return TOOL_METADATA.find((tool) => tool.id === toolId) || null;
}

function screenFor(toolId: string): HTMLElement | null {
  const metadata = metadataFor(toolId);
  return metadata ? (document.querySelector(`#${metadata.screenId}`) as HTMLElement | null) : null;
}

function isToolDirty(toolId: string): boolean {
  return Boolean(toolHooks.get(toolId)?.isDirty());
}

function updateGlobalSaveButton(): void {
  const globalSaveButton = w().globalSaveButton;
  if (!globalSaveButton) return;
  const dirty = TOOL_METADATA.some((tool) => isToolDirty(tool.id));
  globalSaveButton.disabled = savingAllTools;
  globalSaveButton.dataset.dashboardDirty = dirty ? "true" : "false";
}

function setGlobalSaveStatus(message = ""): void {
  const status = w().globalSaveStatus;
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("hidden", !message);
}

async function saveAllTools(): Promise<void> {
  const globalSaveButton = w().globalSaveButton;
  if (!globalSaveButton) return;
  if (savingAllTools) return;
  const activeElement = document.activeElement;
  if (activeElement && activeElement !== globalSaveButton && "blur" in activeElement) {
    (activeElement as HTMLElement).blur();
  }
  const dirtyTools = TOOL_METADATA.filter((tool) => isToolDirty(tool.id));
  if (!dirtyTools.length) {
    setGlobalSaveStatus();
    updateGlobalSaveButton();
    return;
  }
  const pendingDeleteCount = typeof w().artCompositionsPendingDeleteCount === "function" ? w().artCompositionsPendingDeleteCount!() : 0;
  if (pendingDeleteCount > 0) {
    const confirmed = window.confirm(`Save All will permanently delete ${pendingDeleteCount} art asset${pendingDeleteCount === 1 ? "" : "s"} and any layout instances that use them. This action cannot be undone.`);
    if (!confirmed) return;
  }
  savingAllTools = true;
  updateGlobalSaveButton();
  globalSaveButton.textContent = "Saving";
  globalSaveButton.dataset.saveError = "false";
  globalSaveButton.title = "";
  setGlobalSaveStatus();
  let failed = false;
  try {
    if (workspaceSave) {
      await workspaceSave();
    } else {
      for (const tool of dirtyTools) {
        const hooks = toolHooks.get(tool.id);
        const saved = await hooks?.save();
        if (saved === false || saved === null) {
          const detail = hooks?.getError?.();
          throw new Error(
            detail
              ? `${tool.label}: ${detail}`
              : `${tool.label} did not save. Review the tool error and try again.`
          );
        }
      }
    }
  } catch (error) {
    failed = true;
    globalSaveButton.dataset.saveError = "true";
    globalSaveButton.textContent = "Save failed";
    globalSaveButton.title = error instanceof Error ? error.message : String(error);
    setGlobalSaveStatus(globalSaveButton.title);
  } finally {
    savingAllTools = false;
    if (!failed) globalSaveButton.textContent = "Save All";
    updateGlobalSaveButton();
  }
}

function isSaveAllHotkey(event: KeyboardEvent): boolean {
  const key = String(event.key || "").toLowerCase();
  return key === "s" && event.shiftKey && (event.metaKey || event.ctrlKey);
}

function handleDashboardKeydown(event: KeyboardEvent): void {
  if (!isSaveAllHotkey(event)) return;
  event.preventDefault();
  void saveAllTools();
}

function resolveUnsafeChangesModal(): void {
  w().unsafeChangesModal?.classList.add("hidden");
}

function hideToolScreens(): void {
  new Set(TOOL_METADATA.map((tool) => screenFor(tool.id)).filter(Boolean)).forEach((screen) => {
    (screen as HTMLElement).classList.add("hidden");
  });
}

async function activateTool(toolId: string | null, options: { force?: boolean } = {}): Promise<void> {
  const { force = false } = options;
  const metadata = metadataFor(toolId) || metadataFor("flow");
  if (!metadata) return;
  if (!force && metadata.id === w().activeToolId) return;
  hideToolScreens();
  w().activeToolId = metadata.id;
  (w().toolTabs || []).forEach((tab) => tab.classList.toggle("is-active", tab.dataset.toolTarget === metadata.id));
  await toolHooks.get(metadata.id)?.setup();
}

export function showDashboardTool(toolId: string): Promise<void> {
  return activateTool(toolId);
}

function setupToolDashboard(): void {
  document.body.classList.add("tool-dashboard-mode");
  w().toolDashboardBar?.classList.remove("hidden");
  if (!dashboardEventsInstalled) {
    w().globalSaveButton?.addEventListener("click", saveAllTools);
    document.addEventListener("keydown", handleDashboardKeydown);
    window.addEventListener?.("pop-party-authoring-error", ((event: CustomEvent<{ message?: string }>) => {
      setGlobalSaveStatus(event.detail?.message || "The working bundle is invalid.");
    }) as EventListener);
    dashboardEventsInstalled = true;
  }
  updateGlobalSaveButton();
  w().unsafeCancelButton?.addEventListener("click", resolveUnsafeChangesModal);
  w().unsafeSaveButton?.addEventListener("click", resolveUnsafeChangesModal);
  w().unsafeChangesModal?.addEventListener("click", (event) => {
    if (event.target === w().unsafeChangesModal) resolveUnsafeChangesModal();
  });
  (w().toolTabs || []).forEach((tab) => {
    tab.addEventListener("click", () => activateTool(tab.dataset.toolTarget || null));
  });
  const initialTool = metadataFor(new URLSearchParams(window.location.search).get("tool"))?.id || "flow";
  activateTool(initialTool, { force: true });
}

export function installToolDashboardGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).setupToolDashboard = setupToolDashboard;
}

installToolDashboardGlobals(typeof window !== "undefined" ? window : globalThis);
