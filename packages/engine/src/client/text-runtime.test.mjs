import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  gameTextDefaultFontFamily,
  gameTextFontOptions,
  gameTextHtml,
  gameTextPlainText,
  normalizeGameTextFontFamily,
  normalizeGameTextMarkup,
  setGameTextHtml,
  transformGameTextMarkup
} = require("./text-runtime");

describe("engine game text runtime", () => {
  it("preserves supported markup while escaping executable markup", () => {
    expect(normalizeGameTextMarkup("Answer\\nText")).toBe("Answer\nText");
    expect(gameTextHtml("<strong>Right</strong> <script>alert(1)</script>")).toBe(
      "<strong>Right</strong> &lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(gameTextPlainText("Answer\\nText<br>Again")).toBe("Answer\nText\nAgain");
    expect(transformGameTextMarkup("<em>One</em>&nbsp;Two", "uppercase")).toBe("<em>ONE</em>&nbsp;TWO");
  });

  it("publishes an immutable font catalog and rejects unregistered families", () => {
    expect(Object.isFrozen(gameTextFontOptions)).toBe(true);
    expect(normalizeGameTextFontFamily(gameTextFontOptions[1].value)).toBe(gameTextFontOptions[1].value);
    expect(normalizeGameTextFontFamily("url(https://example.test/font.woff2)")).toBe(gameTextDefaultFontFamily);
  });

  it("renders safe HTML and plain text into lightweight targets", () => {
    const target = { innerHTML: "", textContent: "" };
    setGameTextHtml(target, "One<br>Two");
    expect(target).toEqual({ innerHTML: "One<br />Two", textContent: "One\nTwo" });
  });
});
