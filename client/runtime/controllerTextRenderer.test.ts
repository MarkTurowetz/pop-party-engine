import { describe, expect, it } from "vitest";
import { PartyGameControllerText } from "./controllerTextRenderer";

describe("PartyGameControllerText (ported controller-text-renderer)", () => {
  it("setText is a no-op without a target", () => {
    expect(() => PartyGameControllerText.setText(null, "Hi")).not.toThrow();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameControllerText?: { setText?: unknown; setButtonText?: unknown } };
    expect(host.PartyGameControllerText?.setText).toBeTypeOf("function");
    expect(host.PartyGameControllerText?.setButtonText).toBeTypeOf("function");
  });
});
