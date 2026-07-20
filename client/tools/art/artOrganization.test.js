import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtAssetsRuntime } = require("../../../server/art-assets-runtime");
const { installDefaultLobbyWidgetCompositions } = require("../../../shared/lobby-widget-art");

const pointPopupTimeline = {
  fps: 30,
  frameCount: 12,
  labels: [
    { name: "appear", frame: 1 },
    { name: "Popup", frame: 1 },
    { name: "on", frame: 11 }
  ],
  commands: [{ frame: 11, type: "stop" }],
  tracks: [
    {
      targetId: "point-text",
      keyframes: [
        { frame: 1, props: { opacity: 0, scale: 0.5 } },
        { frame: 11, props: { opacity: 1, scale: 1 } }
      ]
    }
  ]
};

function createRuntime(options = {}) {
  return createArtAssetsRuntime({
    acceptedArtTypes: [],
    artCompositions: options.artCompositions || [],
    artAssets: [],
    artGroups: [],
    artRoot: "/tmp/party-game-art-test",
    contentTypeForFile: () => "application/octet-stream",
    customDir: "/tmp/party-game-art-test/custom",
    defaultDir: "/tmp/party-game-art-test/default",
    manifestFile: "/tmp/party-game-art-test/manifest.json",
    readJson: () => ({}),
    sendJson: () => {}
  });
}

describe("art organization folders", () => {
  it("keeps folders nested inside folders", () => {
    const runtime = createRuntime();
    const normalized = runtime.normalizeArtOrganization({
      stage: {
        folders: [
          { id: "parent", name: "Parent" },
          { id: "child", name: "Child" }
        ],
        order: ["folder:parent"],
        folderItems: {
          parent: ["folder:child"],
          child: ["composition:voting-card"]
        }
      }
    });

    expect(normalized.stage.order).toEqual(["folder:parent"]);
    expect(normalized.stage.folderItems.parent).toEqual(["folder:child"]);
    expect(normalized.stage.folderItems.child).toEqual(["composition:voting-card"]);
  });

  it("removes cyclic folder nesting", () => {
    const runtime = createRuntime();
    const normalized = runtime.normalizeArtOrganization({
      stage: {
        folders: [
          { id: "a", name: "A" },
          { id: "b", name: "B" }
        ],
        order: ["folder:a"],
        folderItems: {
          a: ["folder:b"],
          b: ["folder:a"]
        }
      }
    });

    const aContainsB = normalized.stage.folderItems.a.includes("folder:b");
    const bContainsA = normalized.stage.folderItems.b.includes("folder:a");
    expect(aContainsB && bContainsA).toBe(false);
  });

  it("keeps each organized asset or folder in only one place", () => {
    const runtime = createRuntime();
    const normalized = runtime.normalizeArtOrganization({
      stage: {
        folders: [
          { id: "generics", name: "Generics" },
          { id: "prefabs", name: "Prefabs" }
        ],
        order: ["folder:generics", "folder:prefabs", "composition:player-answer-bubble"],
        folderItems: {
          generics: ["folder:prefabs"],
          prefabs: ["composition:player-answer-bubble"]
        }
      }
    });

    expect(normalized.stage.order).toEqual(["folder:generics"]);
    expect(normalized.stage.folderItems.generics).toEqual(["folder:prefabs"]);
    expect(normalized.stage.folderItems.prefabs).toEqual(["composition:player-answer-bubble"]);
  });

  it("promotes an unreachable folder to the root so its compositions remain visible", () => {
    const runtime = createRuntime();
    const normalized = runtime.normalizeArtOrganization({
      stage: {
        folders: [{ id: "text-objects", name: "Text Objects" }],
        order: [],
        folderItems: {
          "text-objects": ["composition:layout-text-field"]
        }
      }
    });

    expect(normalized.stage.order).toContain("folder:text-objects");
    expect(normalized.stage.folderItems["text-objects"]).toContain("composition:layout-text-field");
  });
});

describe("art composition child persistence", () => {
  it("allows a valid composition save when an unrelated legacy composition already has validation issues", async () => {
    const valid = {
      id: "valid-widget",
      name: "Valid Widget",
      surface: "stage",
      compositionKind: "prefab",
      timelineArchitectureVersion: 2,
      canvas: { width: 100, height: 100 },
      components: [{ id: "valid-shape", instanceLabel: "validShape", name: "Valid Shape", kind: "shape" }]
    };
    const legacy = {
      id: "legacy-widget",
      name: "Legacy Widget",
      surface: "stage",
      compositionKind: "prefab",
      timelineArchitectureVersion: 2,
      canvas: { width: 100, height: 100 },
      components: [{ id: "legacy-shape", name: "Legacy Shape", kind: "shape" }]
    };
    let manifest = {};
    let requestPayload = {};
    let responseStatus = 0;
    let responseBody = null;
    const runtime = createArtAssetsRuntime({
      acceptedArtTypes: [],
      artCompositions: [valid, legacy],
      artAssets: [],
      artGroups: [],
      artRoot: "/tmp/party-game-art-validation-baseline-test",
      contentTypeForFile: () => "application/octet-stream",
      customDir: "/tmp/party-game-art-validation-baseline-test/custom",
      defaultDir: "/tmp/party-game-art-validation-baseline-test/default",
      manifestFile: "/tmp/party-game-art-validation-baseline-test/manifest.json",
      loadArtManifestSource: async () => manifest,
      readJson: async () => requestPayload,
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      writeArtManifestSource: async (nextManifest) => {
        manifest = nextManifest;
        return manifest;
      }
    });

    await runtime.sendArtAssetList({});
    const edited = responseBody.compositions.find((composition) => composition.id === valid.id);
    edited.description = "A valid saved change";
    requestPayload = { compositions: [edited], revision: responseBody.revision };

    await runtime.handleSaveArtCompositions({}, {});

    expect(responseStatus).toBe(200);
    expect(manifest.compositions[valid.id].description).toBe("A valid saved change");

    requestPayload = { compositions: [legacy], revision: responseBody.revision };
    await runtime.handleSaveArtCompositions({}, {});
    expect(responseStatus).toBe(409);
    expect(responseBody.issues).toContainEqual(expect.objectContaining({
      compositionId: legacy.id,
      code: "missing-instance-label"
    }));
  });

  it("saves Controller Invalid Banner across unrelated manifest writes but protects same-asset conflicts", async () => {
    const invalidBanner = {
      id: "controller-invalid-banner",
      name: "Controller Invalid Banner",
      surface: "controller",
      compositionKind: "gameObject",
      timelineArchitectureVersion: 2,
      canvas: { width: 330, height: 64 },
      components: [
        {
          id: "invalid-text",
          instanceLabel: "invalidText",
          name: "Invalid Text",
          kind: "text",
          x: 165,
          y: 32,
          width: 290,
          height: 34,
          autoFitText: false
        },
        { id: "invalid-card", instanceLabel: "invalidCard", name: "Invalid Card", kind: "shape", x: 165, y: 32, width: 330, height: 64 }
      ]
    };
    let manifest = {};
    let requestPayload = {};
    let responseStatus = 0;
    let responseBody = null;
    const runtime = createArtAssetsRuntime({
      acceptedArtTypes: [],
      artCompositions: [invalidBanner],
      artAssets: [],
      artGroups: [],
      artRoot: "/tmp/party-game-art-invalid-banner-revision-test",
      contentTypeForFile: () => "application/octet-stream",
      customDir: "/tmp/party-game-art-invalid-banner-revision-test/custom",
      defaultDir: "/tmp/party-game-art-invalid-banner-revision-test/default",
      manifestFile: "/tmp/party-game-art-invalid-banner-revision-test/manifest.json",
      loadArtManifestSource: async () => manifest,
      readJson: async () => requestPayload,
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      writeArtManifestSource: async (nextManifest) => {
        manifest = nextManifest;
        return manifest;
      }
    });

    await runtime.sendArtAssetList({});
    const loadedRevision = responseBody.revision;
    const loadedCompositionRevision = responseBody.compositionRevisions[invalidBanner.id];
    const edited = responseBody.compositions.find((composition) => composition.id === invalidBanner.id);
    const editedInvalidText = edited.components.find((component) => component.id === "invalid-text");
    editedInvalidText.x = 166;
    editedInvalidText.autoFitText = true;

    manifest = { ...manifest, unrelatedWrite: "newer manifest data" };
    requestPayload = {
      compositions: [edited],
      revision: loadedRevision,
      expectedCompositionRevisions: { [invalidBanner.id]: loadedCompositionRevision }
    };
    await runtime.handleSaveArtCompositions({}, {});

    expect(responseStatus).toBe(200);
    expect(manifest.compositions[invalidBanner.id].components)
      .toContainEqual(expect.objectContaining({ id: "invalid-text", x: 166, autoFitText: true }));

    const savedRevision = responseBody.revision;
    const savedCompositionRevision = responseBody.compositionRevisions[invalidBanner.id];
    manifest.compositions[invalidBanner.id] = {
      ...manifest.compositions[invalidBanner.id],
      description: "Changed in another editor",
      updatedAt: "2026-07-17T08:00:00.000Z"
    };
    requestPayload = {
      compositions: [edited],
      revision: savedRevision,
      expectedCompositionRevisions: { [invalidBanner.id]: savedCompositionRevision }
    };
    await runtime.handleSaveArtCompositions({}, {});

    expect(responseStatus).toBe(409);
    expect(responseBody.conflictCompositionIds).toEqual([invalidBanner.id]);
    expect(responseBody.error).toContain("changed");
  });

  it("repairs missing Crafting Timer instance labels during normalization", () => {
    const runtime = createRuntime({
      artCompositions: [{
        id: "crafting-timer",
        name: "Crafting Timer",
        timelineArchitectureVersion: 2,
        canvas: { width: 180, height: 180 },
        components: [
          { id: "timer-value", name: "Timer Value", kind: "text" },
          { id: "timer-background", name: "Timer Background", kind: "shape" },
          { id: "timer-fill", name: "Timer Fill", kind: "shape" }
        ]
      }]
    });

    const [normalized] = runtime.normalizeArtCompositionsDraft([{
      id: "crafting-timer",
      timelineArchitectureVersion: 2,
      components: [
        { id: "timer-value", name: "Timer Value", kind: "text", instanceLabel: "" },
        { id: "timer-background", name: "Timer Background", kind: "shape", instanceLabel: "" },
        { id: "timer-fill", name: "Timer Fill", kind: "shape", instanceLabel: "" }
      ]
    }]);

    expect(normalized.components).toEqual([
      expect.objectContaining({ id: "timer-value", instanceLabel: "timerValue" }),
      expect.objectContaining({ id: "timer-background", instanceLabel: "timerBackground" }),
      expect.objectContaining({ id: "timer-fill", instanceLabel: "timerFill" })
    ]);
  });

  it("persists Waiting Status child art through batch save and reload", async () => {
    const definitions = installDefaultLobbyWidgetCompositions([{
      id: "waiting-status-widget",
      name: "Waiting Status",
      surface: "stage",
      canvas: { width: 700, height: 82 },
      components: [
        { id: "status-text", name: "Status Text", kind: "text", x: 350, y: 41, width: 640, height: 48, defaultText: "Waiting" },
        { id: "status-pill", name: "Status Pill", kind: "shape", x: 350, y: 41, width: 700, height: 76 }
      ]
    }]);
    let manifest = {};
    let requestPayload = {};
    let responseStatus = 0;
    let responseBody = null;
    const runtime = createArtAssetsRuntime({
      acceptedArtTypes: [],
      artCompositions: definitions,
      artAssets: [],
      artGroups: [],
      artRoot: "/tmp/party-game-art-waiting-status-test",
      contentTypeForFile: () => "application/octet-stream",
      customDir: "/tmp/party-game-art-waiting-status-test/custom",
      defaultDir: "/tmp/party-game-art-waiting-status-test/default",
      manifestFile: "/tmp/party-game-art-waiting-status-test/manifest.json",
      loadArtManifestSource: async () => manifest,
      readJson: async () => requestPayload,
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      writeArtManifestSource: async (nextManifest) => {
        manifest = nextManifest;
        return manifest;
      }
    });

    await runtime.sendArtAssetList({});
    const child = responseBody.compositions.find((composition) => composition.id === "prefab-waiting-status-art");
    child.components.find((component) => component.id === "status-text").defaultText = "Saved waiting status";
    requestPayload = { compositions: [child], revision: responseBody.revision };

    await runtime.handleSaveArtCompositions({}, {});
    expect(responseStatus).toBe(200);
    expect(manifest.compositions["prefab-waiting-status-art"].components)
      .toContainEqual(expect.objectContaining({ id: "status-text", defaultText: "Saved waiting status" }));

    await runtime.sendArtAssetList({});
    const reloadedChild = responseBody.compositions.find((composition) => composition.id === "prefab-waiting-status-art");
    expect(reloadedChild.components).toContainEqual(
      expect.objectContaining({ id: "status-text", defaultText: "Saved waiting status" })
    );
  });

  it("saves a migration batch in one manifest write and rejects stale revisions", async () => {
    let payload = {
      compositions: [{
        id: "prefab-child",
        name: "Child",
        surface: "stage",
        compositionKind: "prefab",
        timelineArchitectureVersion: 2,
        canvas: { width: 100, height: 100 },
        components: [{ id: "shape-id", instanceLabel: "shape", name: "Shape", kind: "shape" }],
        timeline: { fps: 30, frameCount: 2, labels: [{ name: "Appear", frame: 0 }], commands: [], tracks: [] }
      }]
    };
    let writes = 0;
    let responseStatus = 0;
    let responseBody = null;
    const runtime = createArtAssetsRuntime({
      acceptedArtTypes: [],
      artCompositions: [],
      artAssets: [],
      artGroups: [],
      artRoot: "/tmp/party-game-art-test",
      contentTypeForFile: () => "application/octet-stream",
      customDir: "/tmp/party-game-art-test/custom",
      defaultDir: "/tmp/party-game-art-test/default",
      manifestFile: "/tmp/party-game-art-test/manifest.json",
      loadArtManifestSource: async () => ({}),
      readJson: async () => payload,
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      writeArtManifestSource: async (manifest) => {
        writes += 1;
        return manifest;
      }
    });

    await runtime.handleSaveArtCompositions({}, {});
    expect(responseStatus).toBe(200);
    expect(responseBody?.compositions).toHaveLength(1);
    expect(responseBody?.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(writes).toBe(1);

    payload = { ...payload, revision: "stale" };
    await runtime.handleSaveArtCompositions({}, {});
    expect(responseStatus).toBe(409);
    expect(writes).toBe(1);
  });

  it("treats saved component children as authoritative", () => {
    const runtime = createRuntime({
      artCompositions: [
        {
          id: "saved-children",
          name: "Saved Children",
          canvas: { width: 100, height: 100 },
          components: [
            {
              id: "root",
              name: "Root",
              kind: "container",
              x: 50,
              y: 50,
              width: 100,
              height: 100,
              children: [
                { id: "card", name: "Card", kind: "shape", x: 50, y: 50, width: 80, height: 80 },
                { id: "text", name: "Text", kind: "text", x: 50, y: 50, width: 80, height: 30 }
              ]
            }
          ]
        }
      ]
    });

    const [composition] = runtime.normalizeArtCompositionsDraft([
      {
        id: "saved-children",
        components: [
          {
            id: "root",
            name: "Root",
            kind: "container",
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            children: [
              { id: "text", name: "Text", kind: "text", x: 50, y: 50, width: 80, height: 30 }
            ]
          }
        ]
      }
    ]);

    expect(composition.components[0].children.map((child) => child.id)).toEqual(["text"]);
  });

  it("preserves saved layer lock state", () => {
    const runtime = createRuntime({
      artCompositions: [
        {
          id: "locked-composition",
          name: "Locked Composition",
          canvas: { width: 100, height: 100 },
          components: [{ id: "root", name: "Root", kind: "shape", x: 50, y: 50, width: 80, height: 80, locked: false }]
        }
      ]
    });

    const [composition] = runtime.normalizeArtCompositionsDraft([
      {
        id: "locked-composition",
        components: [{
          id: "root",
          name: "Root",
          kind: "shape",
          x: 50,
          y: 50,
          width: 80,
          height: 80,
          locked: true,
          editorHidden: true,
          transformOrigin: "bottomRight"
        }]
      }
    ]);

    expect(composition.components[0].locked).toBe(true);
    expect(composition.components[0].editorHidden).toBe(true);
    expect(composition.components[0].transformOrigin).toBe("bottomRight");
  });

  it("persists composition timelines through the save handler", async () => {
    let responseBody = null;
    const runtime = createArtAssetsRuntime({
      acceptedArtTypes: [],
      artCompositions: [
        {
          id: "player-point-popup",
          name: "Player Point Popup",
          canvas: { width: 200, height: 120 },
          components: [{ id: "point-text", name: "Point Text", kind: "text", x: 100, y: 50, width: 160, height: 60 }]
        }
      ],
      artAssets: [],
      artGroups: [],
      artRoot: "/tmp/party-game-art-test",
      contentTypeForFile: () => "application/octet-stream",
      customDir: "/tmp/party-game-art-test/custom",
      defaultDir: "/tmp/party-game-art-test/default",
      manifestFile: "/tmp/party-game-art-test/manifest.json",
      loadArtManifestSource: async () => ({}),
      readJson: async () => ({
        composition: {
          id: "player-point-popup",
          name: "Player Point Popup",
          canvas: { width: 200, height: 120 },
          components: [{ id: "point-text", name: "Point Text", kind: "text", x: 100, y: 50, width: 160, height: 60 }],
          timeline: pointPopupTimeline
        }
      }),
      sendJson: (_res, _status, body) => {
        responseBody = body;
      },
      writeArtManifestSource: async (manifest) => manifest
    });

    await runtime.handleSaveArtComposition({}, {}, "player-point-popup");

    expect(responseBody?.composition?.timeline).toMatchObject({
      fps: 30,
      frameCount: 12,
      labels: expect.arrayContaining([{ name: "appear", frame: 1 }]),
      tracks: [expect.objectContaining({ targetId: "point-text" })]
    });
  });

  it("hydrates missing saved composition timelines from default composition timelines", () => {
    const runtime = createRuntime({
      artCompositions: [
        {
          id: "player-point-popup",
          name: "Player Point Popup",
          canvas: { width: 200, height: 120 },
          components: [{ id: "point-text", name: "Point Text", kind: "text", x: 100, y: 50, width: 160, height: 60 }],
          timeline: pointPopupTimeline
        }
      ]
    });

    const [composition] = runtime.normalizeArtCompositionsDraft([
      {
        id: "player-point-popup",
        name: "Saved Point Popup",
        components: [{ id: "point-text", name: "Point Text", kind: "text", x: 100, y: 50, width: 160, height: 60 }]
      }
    ]);

    expect(composition.timeline).toMatchObject({
      frameCount: 12,
      labels: expect.arrayContaining([{ name: "appear", frame: 1 }]),
      tracks: [expect.objectContaining({ targetId: "point-text" })]
    });
  });
});

describe("art composition cleanup", () => {
  function cleanupComposition(id, components = []) {
    return {
      id,
      name: id,
      surface: "stage",
      compositionKind: "prefab",
      timelineArchitectureVersion: 2,
      canvas: { width: 100, height: 100 },
      components
    };
  }

  function cleanupRuntime(compositions) {
    let manifest = {};
    let requestPayload = {};
    let responseStatus = 0;
    let responseBody = null;
    let writes = 0;
    const runtime = createArtAssetsRuntime({
      acceptedArtTypes: [],
      artCompositions: compositions,
      artAssets: [],
      artGroups: [],
      artRoot: "/tmp/party-game-art-cleanup-test",
      contentTypeForFile: () => "application/octet-stream",
      customDir: "/tmp/party-game-art-cleanup-test/custom",
      defaultDir: "/tmp/party-game-art-cleanup-test/default",
      manifestFile: "/tmp/party-game-art-cleanup-test/manifest.json",
      loadArtDependencySources: async () => ({}),
      loadArtManifestSource: async () => manifest,
      readJson: async () => requestPayload,
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      writeArtManifestSource: async (nextManifest) => {
        writes += 1;
        manifest = nextManifest;
        return manifest;
      }
    });
    return {
      runtime,
      get responseStatus() { return responseStatus; },
      get responseBody() { return responseBody; },
      get writes() { return writes; },
      setManifest(nextManifest) { manifest = nextManifest; },
      setRequestPayload(nextPayload) { requestPayload = nextPayload; }
    };
  }

  async function loadCleanupSnapshot(harness) {
    await harness.runtime.sendArtAssetList({});
    return harness.responseBody;
  }

  it("blocks deletion while an asset is still referenced", async () => {
    const source = cleanupComposition("source");
    const owner = cleanupComposition("owner", [
      { id: "source-instance", name: "Source", kind: "reference", artCompositionId: "source" }
    ]);
    const harness = cleanupRuntime([owner, source]);
    const snapshot = await loadCleanupSnapshot(harness);
    harness.setRequestPayload({
      deleteCompositionIds: ["source"],
      expectedCompositionRevisions: { source: snapshot.compositionRevisions.source },
      revision: snapshot.revision
    });

    await harness.runtime.handleCleanupArtCompositions({}, {});

    expect(harness.responseStatus).toBe(409);
    expect(harness.responseBody?.error).toContain("still referenced");
    expect(harness.responseBody?.blockingDependencies).toEqual([
      expect.objectContaining({ kind: "art", sourceCompositionId: "owner" })
    ]);
    expect(harness.writes).toBe(0);
  });

  it("allows mutually related assets to be deleted together in one write", async () => {
    const source = cleanupComposition("source");
    const owner = cleanupComposition("owner", [
      { id: "source-instance", name: "Source", kind: "reference", artCompositionId: "source" }
    ]);
    const harness = cleanupRuntime([owner, source]);
    const snapshot = await loadCleanupSnapshot(harness);
    harness.setRequestPayload({
      deleteCompositionIds: ["owner", "source"],
      expectedCompositionRevisions: {
        owner: snapshot.compositionRevisions.owner,
        source: snapshot.compositionRevisions.source
      },
      revision: snapshot.revision
    });

    await harness.runtime.handleCleanupArtCompositions({}, {});

    expect(harness.responseStatus).toBe(200);
    expect(harness.responseBody?.compositions).toEqual([]);
    expect(harness.writes).toBe(1);
  });

  it("rebases a reviewed cleanup over an unrelated manifest change", async () => {
    const source = cleanupComposition("source");
    const survivor = cleanupComposition("survivor");
    const harness = cleanupRuntime([source, survivor]);
    const snapshot = await loadCleanupSnapshot(harness);
    harness.setManifest({ organization: { stage: { order: ["composition:survivor"] } } });
    harness.setRequestPayload({
      deleteCompositionIds: ["source"],
      expectedCompositionRevisions: { source: snapshot.compositionRevisions.source },
      revision: snapshot.revision
    });

    await harness.runtime.handleCleanupArtCompositions({}, {});

    expect(harness.responseStatus).toBe(200);
    expect(harness.responseBody?.compositions.map((composition) => composition.id)).toEqual(["survivor"]);
    expect(harness.writes).toBe(1);
  });

  it("preserves Trash for review when the target asset changed", async () => {
    const source = cleanupComposition("source");
    const harness = cleanupRuntime([source]);
    const snapshot = await loadCleanupSnapshot(harness);
    harness.setManifest({
      compositions: {
        source: { ...source, name: "Source changed elsewhere" }
      }
    });
    harness.setRequestPayload({
      deleteCompositionIds: ["source"],
      expectedCompositionRevisions: { source: snapshot.compositionRevisions.source },
      revision: snapshot.revision
    });

    await harness.runtime.handleCleanupArtCompositions({}, {});

    expect(harness.responseStatus).toBe(409);
    expect(harness.responseBody?.conflictingCompositionIds).toEqual(["source"]);
    expect(harness.responseBody?.error).toContain("changed elsewhere");
    expect(harness.writes).toBe(0);
  });
});

describe("legacy art composition migrations", () => {
  it("puts player answer bubble text above its card and tail", () => {
    const runtime = createRuntime({
      artCompositions: [
        {
          id: "player-answer-bubble",
          name: "Player Answer Bubble",
          canvas: { width: 300, height: 180 },
          components: [
            { id: "answer-bubble-tail", name: "Answer Bubble Tail", kind: "shape", x: 150, y: 165, width: 24, height: 24 },
            { id: "answer-bubble-card", name: "Answer Bubble Card", kind: "shape", x: 150, y: 92, width: 270, height: 128 },
            { id: "answer-text", name: "Answer Text", kind: "text", x: 150, y: 92, width: 226, height: 78 }
          ]
        }
      ]
    });

    const [composition] = runtime.normalizeArtCompositionsDraft([
      {
        id: "player-answer-bubble",
        components: [
          { id: "answer-bubble-tail", name: "Answer Bubble Tail", kind: "shape", x: 150, y: 165, width: 24, height: 24 },
          { id: "answer-bubble-card", name: "Answer Bubble Card", kind: "shape", x: 150, y: 92, width: 270, height: 128 },
          { id: "answer-text", name: "Answer Text", kind: "text", x: 150, y: 92, width: 226, height: 78 }
        ]
      }
    ]);

    expect(composition.components.map((component) => component.id)).toEqual([
      "answer-text",
      "answer-bubble-card",
      "answer-bubble-tail"
    ]);
  });

  it("expands saved player object canvases to fit nested label prefabs", () => {
    const runtime = createRuntime({
      artCompositions: [
        {
          id: "player-object-rex",
          name: "Rex Player Object",
          canvas: { width: 300, height: 370 },
          components: [
            { id: "answer-bubble", name: "Answer Bubble Slot", kind: "reference", x: 150, y: 96, width: 300, height: 180, artCompositionId: "player-answer-bubble" },
            { id: "avatar", name: "Player Avatar", kind: "container", x: 150, y: 234, width: 100, height: 100 },
            { id: "player-name", name: "Player Name Widget", kind: "reference", x: 150, y: 309, width: 126, height: 42, artCompositionId: "player-name-widget" },
            { id: "vip-badge", name: "VIP Badge Widget", kind: "reference", x: 150, y: 345, width: 52, height: 28, artCompositionId: "player-vip-widget" }
          ]
        }
      ]
    });

    const [composition] = runtime.normalizeArtCompositionsDraft([
      {
        id: "player-object-rex",
        canvas: { width: 300, height: 300 },
        components: [
          { id: "answer-bubble", name: "Answer Bubble Slot", kind: "reference", x: 150, y: 96, width: 225, height: 135, artCompositionId: "player-answer-bubble" },
          { id: "avatar", name: "Player Avatar", kind: "container", x: 150, y: 234, width: 100, height: 100 }
        ]
      }
    ]);

    expect(composition.canvas).toEqual({ width: 300, height: 370 });
    expect(composition.components.map((component) => component.id)).toEqual(["answer-bubble", "avatar", "player-name", "vip-badge"]);
    expect(composition.components[0]).toMatchObject({ width: 225, height: 135 });
  });
});

describe("art container distribution", () => {
  it("normalizes child distribution on container components", () => {
    const runtime = createRuntime();
    const [composition] = runtime.normalizeArtCompositionsDraft([
      {
        id: "test-composition",
        name: "Test Composition",
        canvas: { width: 400, height: 200 },
        components: [
          {
            id: "row",
            name: "Row",
            kind: "container",
            childDistribution: "horizontal",
            x: 200,
            y: 100,
            width: 300,
            height: 120,
            children: []
          },
          {
            id: "bad-row",
            name: "Bad Row",
            kind: "container",
            childDistribution: "diagonal",
            x: 200,
            y: 100,
            width: 300,
            height: 120,
            children: []
          }
        ]
      }
    ]);

    expect(composition.components[0].childDistribution).toBe("horizontal");
    expect(composition.components[1].childDistribution).toBe("none");
  });
});
