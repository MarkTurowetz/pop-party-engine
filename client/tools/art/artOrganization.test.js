import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtAssetsRuntime } = require("../../../server/art-assets-runtime");

function createRuntime() {
  return createArtAssetsRuntime({
    acceptedArtTypes: [],
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
