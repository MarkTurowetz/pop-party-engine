import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtAssetsRuntime } = require("../../../server/art-assets-runtime");

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
