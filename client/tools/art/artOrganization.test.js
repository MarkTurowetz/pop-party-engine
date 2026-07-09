import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtAssetsRuntime } = require("../../../server/art-assets-runtime");

const pointPopupTimeline = {
  fps: 30,
  frameCount: 12,
  labels: [
    { name: "appear", frame: 1 },
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
});

describe("art composition child persistence", () => {
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
        components: [{ id: "root", name: "Root", kind: "shape", x: 50, y: 50, width: 80, height: 80, locked: true }]
      }
    ]);

    expect(composition.components[0].locked).toBe(true);
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
