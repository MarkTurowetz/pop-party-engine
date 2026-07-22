import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeArtAssetReplacementsDraft, parseArtAssetReplacement } = require("./art-asset-replacement-runtime");

const acceptedArtTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp"
};

describe("Art asset replacement contracts", () => {
  it("parses a matching data URL and normalizes JPEG filenames", () => {
    const replacement = parseArtAssetReplacement({
      dataUrl: "data:image/jpeg;base64,YQ==",
      fileName: "../portrait.jpeg",
      mimeType: "image/jpeg"
    }, { acceptedArtTypes });

    expect(replacement.fileName).toBe("portrait.jpeg");
    expect(replacement.expectedExtension).toBe(".jpg");
    expect(replacement.buffer.toString()).toBe("a");
  });

  it("rejects mismatched MIME declarations and extensions", () => {
    expect(() => parseArtAssetReplacement({
      dataUrl: "data:image/png;base64,YQ==",
      fileName: "portrait.png",
      mimeType: "image/jpeg"
    }, { acceptedArtTypes })).toThrow("Use a PNG, SVG, JPG, or WEBP file");

    expect(() => parseArtAssetReplacement({
      dataUrl: "data:image/png;base64,YQ==",
      fileName: "portrait.webp",
      mimeType: "image/png"
    }, { acceptedArtTypes })).toThrow("Selected file does not match image/png");
  });

  it("normalizes game-owned asset drafts without retaining decoded buffers", () => {
    const replacements = normalizeArtAssetReplacementsDraft({
      backdrop: {
        dataUrl: "data:image/png;base64,YQ==",
        fileName: "backdrop.png",
        mimeType: "image/png"
      }
    }, {
      acceptedArtTypes,
      artAssets: [{ id: "backdrop" }],
      now: () => "2026-07-22T12:00:00.000Z"
    });

    expect(replacements).toEqual({
      backdrop: {
        dataUrl: "data:image/png;base64,YQ==",
        fileName: "backdrop.png",
        mimeType: "image/png",
        updatedAt: "2026-07-22T12:00:00.000Z"
      }
    });
    expect(() => normalizeArtAssetReplacementsDraft({ missing: {} }, {
      acceptedArtTypes,
      artAssets: [{ id: "backdrop" }]
    })).toThrow("Unknown art asset id: missing");
  });
});
