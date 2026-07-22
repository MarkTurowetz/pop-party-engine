import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertSafeSvg, svgResponseHeaders } = require("./svg-sanitizer");

describe("SVG upload isolation", () => {
  it("accepts self-contained authored SVG", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M0 0h10v10z"/></svg>');
    expect(assertSafeSvg(svg)).toBe(svg);
  });

  it("rejects script, handlers, foreign objects, and remote references", () => {
    for (const unsafe of [
      "<svg><script>alert(1)</script></svg>",
      '<svg><path onclick="alert(1)"/></svg>',
      "<svg><foreignObject></foreignObject></svg>",
      '<svg><image href="https://evil.test/x"/></svg>'
    ]) expect(() => assertSafeSvg(Buffer.from(unsafe))).toThrow(/unsafe/);
  });

  it("serves SVG with a sandbox and nosniff", () => {
    expect(svgResponseHeaders()).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": expect.stringContaining("sandbox")
    });
  });
});
