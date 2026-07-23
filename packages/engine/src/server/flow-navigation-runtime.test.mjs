import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createFlowNavigationRuntime } = require("./flow-navigation-runtime");

function runtime() {
  const legacyFlow = { states: [{ id: "legacy", actions: [] }] };
  const localDraftStore = { flow: { states: [{ id: "draft", actions: [] }] } };
  const readGameFlow = vi.fn(() => legacyFlow);
  return {
    legacyFlow,
    localDraftStore,
    readGameFlow,
    runtime: createFlowNavigationRuntime({
      flowActionTarget: (value) => value,
      isNoActionTarget: (value) => !value,
      isReturnActionTarget: () => false,
      localDraftStore,
      normalizeFlowId: (value) => String(value || "").toLowerCase(),
      readGameFlow
    })
  };
}

describe("flow navigation authority", () => {
  it("uses the room's pinned bundle flow ahead of process-global drafts and legacy sources", () => {
    const { runtime: navigation, readGameFlow } = runtime();
    const pinnedFlow = { states: [{ id: "pinned", actions: [] }] };
    const room = { gameData: { defaultGameFlow: pinnedFlow } };

    expect(navigation.runtimeGameFlow(room)).toBe(pinnedFlow);
    expect(readGameFlow).not.toHaveBeenCalled();
  });

  it("allows an explicit room test override but never another room's pinned flow", () => {
    const { runtime: navigation } = runtime();
    const pinnedFlow = { states: [{ id: "pinned", actions: [] }] };
    const override = { states: [{ id: "test", actions: [] }] };
    const room = { gameData: { defaultGameFlow: pinnedFlow }, runtimeFlowOverride: override };

    expect(navigation.runtimeGameFlow(room)).toBe(override);
    expect(navigation.runtimeGameFlow({ gameData: { defaultGameFlow: pinnedFlow } })).toBe(pinnedFlow);
  });

  it("keeps the legacy draft/source path only for rooms without a content pin", () => {
    const { runtime: navigation, localDraftStore, legacyFlow } = runtime();
    expect(navigation.runtimeGameFlow({})).toBe(localDraftStore.flow);
    localDraftStore.flow = null;
    expect(navigation.runtimeGameFlow({})).toBe(legacyFlow);
  });
});
