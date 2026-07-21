import { describe, expect, it } from "vitest";
import { controllerViewVisitKey } from "./controllerViewVisit";

describe("controllerViewVisitKey", () => {
  it("keeps heartbeats in the same input lifecycle", () => {
    const lobby = { gameSessionId: 3, momentVisitId: 8, textInput: { actionId: "write", visitId: 12 } };
    expect(controllerViewVisitKey(lobby, {}, "writing")).toBe(controllerViewVisitKey({ ...lobby, revision: 99 }, {}, "writing"));
  });

  it("creates a fresh lifecycle when the same action is entered again", () => {
    const first = { gameSessionId: 3, momentVisitId: 8, textInput: { actionId: "write", visitId: 12 } };
    const second = { ...first, textInput: { actionId: "write", visitId: 13 } };
    expect(controllerViewVisitKey(first, {}, "writing")).not.toBe(controllerViewVisitKey(second, {}, "writing"));
  });

  it("creates a fresh lifecycle when a new game starts", () => {
    const lobby = { gameSessionId: 3, momentVisitId: 8, action: { id: "presentation" } };
    expect(controllerViewVisitKey(lobby, {}, "presentation")).not.toBe(
      controllerViewVisitKey({ ...lobby, gameSessionId: 4 }, {}, "presentation")
    );
  });
});
