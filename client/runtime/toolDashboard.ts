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

export interface DashboardWorkspaceActions {
  save: () => Promise<unknown>;
  sync: () => Promise<unknown>;
  restore: () => Promise<unknown>;
  subscribe?: (listener: (status: {
    phase: "synced" | "saved-local" | "syncing" | "error";
    message: string;
  }) => void) => (() => void);
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
    globalSyncButton?: HTMLButtonElement;
    globalRestoreGitButton?: HTMLButtonElement;
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
let syncingWorkspace = false;
let restoringWorkspace = false;
let dashboardEventsInstalled = false;
let workspaceActions: DashboardWorkspaceActions | null = null;
let disposeWorkspaceStatus: (() => void) | null = null;
let latestWorkspaceStatus: {
  phase: "synced" | "saved-local" | "syncing" | "error";
  message: string;
} | null = null;

/** Register a /tools tab's dirty/save/setup behaviour (called by tools.tsx). */
export function registerDashboardTool(id: string, hooks: DashboardToolHooks): void {
  toolHooks.set(id, hooks);
}

export function registerDashboardWorkspaceSave(save: (() => Promise<unknown>) | null): void {
  workspaceActions = save ? {
    save,
    sync: async () => undefined,
    restore: async () => undefined
  } : null;
}

export function registerDashboardWorkspaceActions(
  actions: DashboardWorkspaceActions | null
): void {
  disposeWorkspaceStatus?.();
  disposeWorkspaceStatus = null;
  workspaceActions = actions;
  if (actions?.subscribe) {
    disposeWorkspaceStatus = actions.subscribe((status) => {
      latestWorkspaceStatus = status;
      setGlobalSaveStatus(status.message, status.phase === "error" ? "error" : "info");
      updateWorkspaceActionButtons(status.phase);
    });
  } else {
    latestWorkspaceStatus = null;
  }
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

function dashboardButton(
  selector: "#globalSaveButton" | "#globalSyncButton" | "#globalRestoreGitButton",
  fallback: HTMLButtonElement | undefined
): HTMLButtonElement | undefined {
  return (document.querySelector(selector) as HTMLButtonElement | null) || fallback;
}

function saveButton(): HTMLButtonElement | undefined {
  return dashboardButton("#globalSaveButton", w().globalSaveButton);
}

function syncButton(): HTMLButtonElement | undefined {
  return dashboardButton("#globalSyncButton", w().globalSyncButton);
}

function restoreButton(): HTMLButtonElement | undefined {
  return dashboardButton("#globalRestoreGitButton", w().globalRestoreGitButton);
}

function updateGlobalSaveButton(): void {
  const globalSaveButton = saveButton();
  if (!globalSaveButton) return;
  const dirty = TOOL_METADATA.some((tool) => isToolDirty(tool.id));
  globalSaveButton.disabled = savingAllTools;
  globalSaveButton.dataset.dashboardDirty = dirty ? "true" : "false";
}

function setGlobalSaveStatus(message = "", tone: "info" | "error" = "info"): void {
  const status = w().globalSaveStatus;
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("hidden", !message);
  status.classList.toggle("is-error", Boolean(message) && tone === "error");
  status.classList.toggle("is-info", Boolean(message) && tone === "info");
}

function updateWorkspaceActionButtons(
  phase: "synced" | "saved-local" | "syncing" | "error" = "synced"
): void {
  const currentSyncButton = syncButton();
  if (currentSyncButton) {
    currentSyncButton.disabled = syncingWorkspace || restoringWorkspace || phase === "syncing";
    currentSyncButton.textContent = phase === "syncing" ? "Syncing…" : "Sync Now";
  }
  const currentRestoreButton = restoreButton();
  if (currentRestoreButton) {
    currentRestoreButton.disabled = syncingWorkspace || restoringWorkspace;
  }
}

async function saveAllTools(): Promise<void> {
  const globalSaveButton = saveButton();
  if (!globalSaveButton) return;
  if (savingAllTools) return;
  const activeElement = document.activeElement;
  if (activeElement && activeElement !== globalSaveButton && "blur" in activeElement) {
    (activeElement as HTMLElement).blur();
  }
  const dirtyTools = TOOL_METADATA.filter((tool) => isToolDirty(tool.id));
  // A recovered server session can lose every server-side draft while the
  // authoritative browser editors still report clean. Workspace Save must run
  // so registered publishers can republish those models before checkpointing.
  if (!dirtyTools.length && !workspaceActions) {
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
    if (workspaceActions) {
      await workspaceActions.save();
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
    setGlobalSaveStatus(globalSaveButton.title, "error");
  } finally {
    savingAllTools = false;
    if (!failed) globalSaveButton.textContent = "Save All";
    updateGlobalSaveButton();
  }
}

async function syncWorkspaceNow(): Promise<void> {
  if (!workspaceActions || syncingWorkspace || restoringWorkspace) return;
  syncingWorkspace = true;
  updateWorkspaceActionButtons("syncing");
  try {
    await workspaceActions.sync();
  } catch (error) {
    setGlobalSaveStatus(
      error instanceof Error ? error.message : String(error),
      "error"
    );
  } finally {
    syncingWorkspace = false;
    updateWorkspaceActionButtons();
  }
}

async function restoreWorkspaceFromGit(): Promise<void> {
  if (!workspaceActions || restoringWorkspace || syncingWorkspace) return;
  const confirmed = window.confirm(
    "Restore the Tools workspace from Git? This permanently removes all browser-local and unsaved changes."
  );
  if (!confirmed) return;
  restoringWorkspace = true;
  updateWorkspaceActionButtons();
  try {
    setGlobalSaveStatus("Restoring from Git…");
    await workspaceActions.restore();
    window.location.reload();
  } catch (error) {
    restoringWorkspace = false;
    updateWorkspaceActionButtons();
    setGlobalSaveStatus(
      error instanceof Error ? error.message : String(error),
      "error"
    );
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

async function handleDashboardClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (target === saveButton()) {
    await saveAllTools();
    return;
  }
  if (target === syncButton()) {
    await syncWorkspaceNow();
    return;
  }
  if (target === restoreButton()) await restoreWorkspaceFromGit();
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
    document.addEventListener("click", handleDashboardClick);
    document.addEventListener("keydown", handleDashboardKeydown);
    window.addEventListener?.("pop-party-authoring-error", ((event: CustomEvent<{ message?: string }>) => {
      setGlobalSaveStatus(
        event.detail?.message || "The working bundle is invalid.",
        "error"
      );
    }) as EventListener);
    window.addEventListener?.("pop-party-authoring-recovery", ((event: CustomEvent<{ state?: string }>) => {
      const recovering = event.detail?.state === "required";
      const globalSaveButton = saveButton();
      if (globalSaveButton && !savingAllTools) {
        globalSaveButton.textContent = recovering ? "Recover Browser Work" : "Save All";
      }
      if (globalSaveButton) globalSaveButton.dataset.authoringRecovery = recovering ? "required" : "recovered";
      setGlobalSaveStatus(
        recovering
          ? "Server restarted · republishing the browser's Art, Layout, and Flow models…"
          : "Browser work recovered and preserved.",
        "info"
      );
    }) as EventListener);
    dashboardEventsInstalled = true;
  }
  updateGlobalSaveButton();
  if (latestWorkspaceStatus) {
    setGlobalSaveStatus(
      latestWorkspaceStatus.message,
      latestWorkspaceStatus.phase === "error" ? "error" : "info"
    );
    updateWorkspaceActionButtons(latestWorkspaceStatus.phase);
  }
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
