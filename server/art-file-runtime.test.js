import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtFileRuntime } = require("./art-file-runtime");
const temporaryRoots = [];

function createFixture({ draftReplacement = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-art-files-"));
  temporaryRoots.push(root);
  const defaultDir = path.join(root, "default");
  const customDir = path.join(root, "custom");
  fs.mkdirSync(defaultDir);
  fs.mkdirSync(customDir);
  fs.writeFileSync(path.join(defaultDir, "backdrop.svg"), "<svg></svg>");
  fs.writeFileSync(path.join(customDir, "custom.svg"), "<svg><path /></svg>");
  const responses = [];
  const runtime = createArtFileRuntime({
    acceptedArtTypes: { "image/png": ".png", "image/svg+xml": ".svg" },
    contentTypeForFile: () => "image/svg+xml",
    customDir,
    defaultDir,
    readDraftReplacement: () => draftReplacement,
    sendJson: (_res, status, body) => responses.push({ status, body }),
    svgResponseHeaders: () => ({ "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" })
  });
  return { responses, runtime };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Art file runtime", () => {
  it("resolves authored custom files and lets an unsaved draft override their public data", () => {
    const draftReplacement = {
      dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      fileName: "draft.svg",
      updatedAt: "2026-07-22T12:00:00.000Z"
    };
    const { runtime } = createFixture({ draftReplacement });
    const asset = runtime.publicArtAsset({
      id: "backdrop",
      name: "Backdrop",
      category: "Background",
      parent: "stage",
      defaultFile: "backdrop.svg",
      use: "Stage backdrop"
    }, {
      backdrop: { fileName: "custom.svg", updatedAt: "2026-07-21T12:00:00.000Z" }
    });

    expect(asset).toEqual(expect.objectContaining({
      currentUrl: draftReplacement.dataUrl,
      defaultUrl: expect.stringMatching(/^\/art\/default\/backdrop\.svg\?v=\d+$/),
      fileName: "draft.svg",
      hasCustom: true,
      hasDraft: true,
      expectedTypes: ["image/png", "image/svg+xml"]
    }));
  });

  it("rejects unknown collections and traversal-shaped filenames", () => {
    const { responses, runtime } = createFixture();

    expect(runtime.resolveArtFilePath("default", "../backdrop.svg")).toBe("");
    expect(runtime.resolveArtFilePath("other", "backdrop.svg")).toBe("");
    runtime.serveArtFile({}, "default", "../backdrop.svg");
    expect(responses).toEqual([{ status: 404, body: { ok: false, error: "Art file not found" } }]);
  });

  it("serves SVG files with the isolated response headers", async () => {
    const { runtime } = createFixture();
    const response = await new Promise((resolve) => {
      const state = {};
      runtime.serveArtFile({
        writeHead(status, headers) {
          state.status = status;
          state.headers = headers;
        },
        end(data) {
          resolve({ ...state, data: data.toString() });
        }
      }, "default", "backdrop.svg");
    });

    expect(response).toEqual({
      status: 200,
      headers: expect.objectContaining({
        "Cache-Control": "no-cache",
        "Content-Security-Policy": "sandbox",
        "Content-Type": "image/svg+xml",
        "X-Content-Type-Options": "nosniff"
      }),
      data: "<svg></svg>"
    });
  });
});
