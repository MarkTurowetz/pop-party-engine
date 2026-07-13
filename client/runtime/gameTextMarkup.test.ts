import { describe, expect, it } from "vitest";
import { gameTextHtml, gameTextPlainText, normalizeGameTextMarkup, transformGameTextMarkup } from "./gameTextMarkup";

describe("game text markup", () => {
  it("treats typed backslash-n and HTML breaks as line breaks", () => {
    expect(normalizeGameTextMarkup("Answer\\nText")).toBe("Answer\nText");
    expect(gameTextHtml("Answer\\nText<br>Again")).toBe("Answer<br />Text<br />Again");
    expect(gameTextPlainText("Answer\\nText<br>Again")).toBe("Answer\nText\nAgain");
  });

  it("preserves safe inline formatting and escapes executable HTML", () => {
    expect(gameTextHtml("<strong>Right</strong> <script>alert(1)</script>")).toBe(
      "<strong>Right</strong> &lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("transforms visible text without corrupting markup or entities", () => {
    expect(transformGameTextMarkup("<em>One</em>&nbsp;Two", "uppercase")).toBe("<em>ONE</em>&nbsp;TWO");
  });
});
