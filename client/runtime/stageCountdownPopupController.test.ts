import { describe, expect, it, vi } from "vitest";
import { StageCountdownPopupController, countdownDisplayValue, shouldPlayCountdownUpdate } from "./stageCountdownPopupController";

describe("StageCountdownPopupController", () => {
  it("plays lifecycle visibility once when entering and leaving the starting phase", () => {
    const playVisibility = vi.fn(() => 0);
    const controller = new StageCountdownPopupController({ resolveEntity: () => ({ playVisibility }) });

    controller.afterPhase("lobby");
    controller.beforePhase("starting");
    controller.afterPhase("starting");
    controller.afterPhase("starting");
    controller.beforePhase("lobby");
    controller.afterPhase("lobby");

    expect(playVisibility).toHaveBeenCalledTimes(2);
    expect(playVisibility).toHaveBeenNthCalledWith(1, true, {});
    expect(playVisibility).toHaveBeenNthCalledWith(2, false, {});
  });

  it("plays Update only for 3 to 2, 2 to 1, and 1 to Let's Go", () => {
    const playAnimation = vi.fn(() => 0);
    const controller = new StageCountdownPopupController({ resolveEntity: () => ({ playAnimation }) });

    controller.afterPhase("starting");
    controller.update(3);
    controller.update(2);
    controller.update(2);
    controller.update(1);
    controller.update(0);

    expect(playAnimation).toHaveBeenCalledTimes(3);
    expect(playAnimation).toHaveBeenNthCalledWith(1, "Update", {});
    expect(playAnimation).toHaveBeenNthCalledWith(2, "Update", {});
    expect(playAnimation).toHaveBeenNthCalledWith(3, "Update", {});
  });

  it("does not treat the initial value or 4 to 3 as an Update transition", () => {
    expect(countdownDisplayValue(0)).toBe("go");
    expect(shouldPlayCountdownUpdate("", "3")).toBe(false);
    expect(shouldPlayCountdownUpdate("4", "3")).toBe(false);
  });
});

