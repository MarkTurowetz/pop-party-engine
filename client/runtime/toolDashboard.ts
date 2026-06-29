// Typed port of the legacy client/tool-dashboard.js — the /tools tab router. Defines
// setupToolDashboard (app-shell dispatches it for role "tools"). Reads the per-tool
// hooks installed on window by tools.tsx (setup/save/isDirty per tool) + app-shell DOM
// refs/state via window. The legacy loadGameConstants helper was dropped — it called
// the deleted legacy constants tool and was never invoked.

interface ToolDefinition {
  id: string;
  label: string;
  screen: () => HTMLElement | undefined;
  isDirty: () => boolean;
  save: () => Promise<unknown> | unknown;
  setup: () => void | Promise<unknown>;
}

declare global {
  interface Window {
    setupToolDashboard?: () => void;
    artCompositionsPendingDeleteCount?: () => number;
    flowScreen?: HTMLElement;
    hostAudioScreen?: HTMLElement;
    constantsScreen?: HTMLElement;
    artScreen?: HTMLElement;
    layoutScreen?: HTMLElement;
    globalSaveButton?: HTMLButtonElement;
    unsafeChangesCopy?: HTMLElement;
    unsafeChangesModal?: HTMLElement;
    unsafeCancelButton?: HTMLElement;
    unsafeSaveButton?: HTMLElement;
    toolDashboardBar?: HTMLElement;
    toolTabs?: HTMLElement[];
    activeToolId?: string;
    pendingToolSwitch?: ((result: string) => void) | null;
  }
}

const w = () => globalThis as typeof globalThis & Window;

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: "flow", label: "Flow Tool", screen: () => w().flowScreen, isDirty: () => Boolean(w().isFlowDirty?.()), save: () => w().saveGameFlow?.(), setup: () => w().setupFlowTool?.() },
  { id: "host-audio", label: "Host Audios", screen: () => w().hostAudioScreen, isDirty: () => Boolean(w().isHostAudiosDirty?.()), save: () => w().saveHostAudios?.(), setup: () => w().setupHostAudioTool?.() },
  {
    id: "constants",
    label: "Game Constants",
    screen: () => w().constantsScreen,
    isDirty: () => Boolean(w().constantsSavedSnapshot && JSON.stringify(w().gameConstants) !== w().constantsSavedSnapshot),
    save: () => w().saveGameConstants?.(),
    setup: () => w().setupConstantsTool?.()
  },
  {
    id: "art",
    label: "Art Manager",
    screen: () => w().artScreen,
    isDirty: () => Boolean(w().pendingArtReplacement) || Boolean(w().isArtCompositionsDirty?.()) || Boolean(w().isArtOrganizationDirty?.()),
    save: async () => {
      if (w().pendingArtReplacement) await w().saveArtReplacement?.();
      if (w().isArtCompositionsDirty?.()) await w().saveArtCompositions?.();
      if (w().isArtOrganizationDirty?.()) await w().saveArtOrganization?.();
    },
    setup: () => w().setupArtTool?.()
  },
  { id: "layout", label: "Layout Tool", screen: () => w().layoutScreen, isDirty: () => Boolean(w().isLayoutDirty?.()), save: () => w().saveStageLayouts?.(), setup: () => w().setupLayoutTool?.("stage") },
  { id: "controller-layout", label: "Controller Layout Tool", screen: () => w().layoutScreen, isDirty: () => Boolean(w().isControllerLayoutDirty?.()), save: () => w().saveControllerLayouts?.(), setup: () => w().setupLayoutTool?.("controller") }
];

function toolDefinition(toolId: string | null): ToolDefinition | null {
  return TOOL_DEFINITIONS.find((definition) => definition.id === toolId) || null;
}

function isToolDirty(toolId: string): boolean {
  return Boolean(toolDefinition(toolId)?.isDirty());
}

function hasGlobalSaveWork(): boolean {
  return TOOL_DEFINITIONS.some((definition) => isToolDirty(definition.id));
}

function updateGlobalSaveButton(): void {
  const globalSaveButton = w().globalSaveButton;
  if (!globalSaveButton) return;
  globalSaveButton.disabled = !hasGlobalSaveWork();
}

async function saveAllTools(): Promise<void> {
  const globalSaveButton = w().globalSaveButton;
  if (!globalSaveButton) return;
  const pendingDeleteCount = typeof w().artCompositionsPendingDeleteCount === "function" ? w().artCompositionsPendingDeleteCount!() : 0;
  if (pendingDeleteCount > 0) {
    const confirmed = window.confirm(`Save All will permanently delete ${pendingDeleteCount} art asset${pendingDeleteCount === 1 ? "" : "s"} and any layout instances that use them. This action cannot be undone.`);
    if (!confirmed) return;
  }
  globalSaveButton.disabled = true;
  globalSaveButton.textContent = "Saving";
  try {
    for (const definition of TOOL_DEFINITIONS) {
      if (isToolDirty(definition.id)) await definition.save();
    }
  } finally {
    globalSaveButton.textContent = "Save All";
    updateGlobalSaveButton();
  }
}

function resolveUnsafeChangesModal(result: string): void {
  w().unsafeChangesModal?.classList.add("hidden");
  const resolve = w().pendingToolSwitch;
  w().pendingToolSwitch = null;
  if (resolve) resolve(result);
}

async function confirmToolSwitch(): Promise<boolean> {
  return true;
}

function hideToolScreens(): void {
  new Set(TOOL_DEFINITIONS.map((definition) => definition.screen()).filter(Boolean)).forEach((screen) => {
    (screen as HTMLElement).classList.add("hidden");
  });
}

async function activateTool(toolId: string | null, options: { force?: boolean } = {}): Promise<void> {
  const { force = false } = options;
  const definition = toolDefinition(toolId) || toolDefinition("flow");
  if (!definition) return;
  if (!force && definition.id === w().activeToolId) return;
  if (!force && !(await confirmToolSwitch())) return;
  hideToolScreens();
  w().activeToolId = definition.id;
  (w().toolTabs || []).forEach((tab) => tab.classList.toggle("is-active", tab.dataset.toolTarget === definition.id));
  await definition.setup();
}

function setupToolDashboard(): void {
  document.body.classList.add("tool-dashboard-mode");
  w().toolDashboardBar?.classList.remove("hidden");
  w().globalSaveButton?.addEventListener("click", saveAllTools);
  updateGlobalSaveButton();
  w().unsafeCancelButton?.addEventListener("click", () => resolveUnsafeChangesModal("cancel"));
  w().unsafeSaveButton?.addEventListener("click", () => resolveUnsafeChangesModal("save"));
  w().unsafeChangesModal?.addEventListener("click", (event) => {
    if (event.target === w().unsafeChangesModal) resolveUnsafeChangesModal("cancel");
  });
  (w().toolTabs || []).forEach((tab) => {
    tab.addEventListener("click", () => activateTool(tab.dataset.toolTarget || null));
  });
  const initialTool = toolDefinition(w().params.get("tool"))?.id || "flow";
  activateTool(initialTool, { force: true });
}

export function installToolDashboardGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).setupToolDashboard = setupToolDashboard;
}

installToolDashboardGlobals(typeof window !== "undefined" ? window : globalThis);
