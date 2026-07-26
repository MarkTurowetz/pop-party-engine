import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createToolDataReadRuntime } = require("./tool-data-read-runtime");

describe("Tool data read runtime", () => {
  it("refreshes every revisioned GitHub draft source on Tool GET", async () => {
    const source = (value) => vi.fn(async () => value);
    const loadGameFlowSource = source({ states: [] });
    const loadGameConstantsSource = source({ gameTitle: "Draft" });
    const loadStageLayoutsSource = source({ global: { elements: [] } });
    const loadControllerLayoutsSource = source({ global: { elements: [] } });
    const loadHostAudiosSource = source({ hostAudios: [] });
    const revisionedStore = {
      storageKind: "github-app-draft",
      revision: "draft-revision"
    };
    const sendJson = vi.fn();
    const runtime = createToolDataReadRuntime({
      availableFlowActionTypes: [],
      availableFlowTransitions: [],
      controllerLayoutsPath: "layouts/controller-layouts.json",
      controllerLayoutsStore: revisionedStore,
      gameConstantsPath: "constants.json",
      gameConstantsStore: revisionedStore,
      gameFlowPath: "flow.json",
      gameFlowStore: revisionedStore,
      githubBranch: "",
      githubRepo: "",
      hasGithubToken: () => false,
      hostAudiosPath: "audio/host-audios.json",
      hostAudiosStore: revisionedStore,
      loadControllerLayoutsSource,
      loadGameConstantsSource,
      loadGameFlowSource,
      loadHostAudiosSource,
      loadStageLayoutsSource,
      localDraftStore: {},
      normalizeGameConstants: (value) => value,
      normalizeGameFlow: (value) => value,
      normalizeHostAudios: (value) => value,
      sendJson,
      stageLayoutsPath: "layouts/stage-layouts.json",
      stageLayoutsStore: revisionedStore,
      syncControllerLayoutsWithFlow: (value) => value,
      syncStageLayoutsWithFlow: (value) => value
    });

    await runtime.sendGameFlow({});
    await runtime.sendGameConstants({});
    await runtime.sendStageLayouts({});
    await runtime.sendControllerLayouts({});
    await runtime.sendHostAudios({});

    expect(loadGameConstantsSource).toHaveBeenCalledWith({ refresh: true });
    expect(loadStageLayoutsSource).toHaveBeenCalledWith({ refresh: true });
    expect(loadControllerLayoutsSource).toHaveBeenCalledWith({ refresh: true });
    expect(loadHostAudiosSource).toHaveBeenCalledWith({ refresh: true });
    expect(loadGameFlowSource).toHaveBeenCalled();
    expect(loadGameFlowSource.mock.calls.every(([options]) => options.refresh === true)).toBe(true);
    expect(sendJson).toHaveBeenCalledTimes(5);
  });
});
