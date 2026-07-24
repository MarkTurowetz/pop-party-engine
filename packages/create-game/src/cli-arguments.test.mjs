import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { HELP_TEXT, parseCreateGameArguments } = require("./cli-arguments");
const { version: defaultEngineVersion } = require("../package.json");

describe("create-game CLI arguments", () => {
  it("parses the npm initializer name and exact options", () => {
    expect(parseCreateGameArguments([
      "Flip 7",
      "--engine-version=1.2.3",
      "--output",
      "/tmp/flip-7",
      "--starter",
      "/tmp/starter"
    ])).toEqual({
      displayName: "Flip 7",
      engineVersion: "1.2.3",
      starterRoot: "/tmp/starter",
      targetRoot: "/tmp/flip-7"
    });
    expect(parseCreateGameArguments(["My Game"]).engineVersion).toBe(defaultEngineVersion);
    expect(parseCreateGameArguments(["--help"])).toEqual({ help: true });
    expect(HELP_TEXT).toContain("npm create @pop-party/game");
  });

  it("rejects missing values, unknown options, and ambiguous names", () => {
    expect(() => parseCreateGameArguments([])).toThrow(/display name is required/i);
    expect(() => parseCreateGameArguments(["Flip 7", "--engine-version"])).toThrow(/requires a value/);
    expect(() => parseCreateGameArguments(["Flip 7", "--output", "--starter", "/tmp/starter"])).toThrow(/requires a value/);
    expect(() => parseCreateGameArguments(["Flip 7", "--unknown"])).toThrow(/Unknown create-game option/);
    expect(() => parseCreateGameArguments(["Flip 7", "Second Name"])).toThrow(/Unexpected game name argument/);
  });
});
