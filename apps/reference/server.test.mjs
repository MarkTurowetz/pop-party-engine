import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("reference application composition", () => {
  it("exports an explicit async startup boundary without binding on import", () => {
    const application = require("./server");
    expect(application.startReferenceApplication).toBeTypeOf("function");
  });
});
