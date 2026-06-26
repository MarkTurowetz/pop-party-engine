import { describe, expect, it } from "vitest";
import { installFlowActionOptionsAdapter } from "./flowActionOptionsAdapter";
import {
  choiceInputModeOptions,
  hostAudioPlayModeOptions,
  playerFilterOptions,
  roundOptions,
  transitionTriggerOptions,
  trueFalseOptions,
  votingCardFilterOptions
} from "./flowActionOptions";

describe("Flow action option helpers", () => {
  it("builds boolean options in either order", () => {
    expect(trueFalseOptions().map((option) => option.id)).toEqual(["true", "false"]);
    expect(trueFalseOptions(false).map((option) => option.id)).toEqual(["false", "true"]);
  });

  it("builds static action option sets", () => {
    expect(choiceInputModeOptions().map((option) => option.id)).toEqual(["singleSelect", "submitOnce", "continuous"]);
    expect(votingCardFilterOptions().map((option) => option.id)).toEqual(["all", "winners", "losers"]);
    expect(playerFilterOptions().map((option) => option.id)).toContain("votingLosers");
    expect(transitionTriggerOptions().map((option) => option.id)).toEqual(["", "onCountdownComplete"]);
    expect(hostAudioPlayModeOptions().map((option) => option.id)).toEqual(["random", "sequence", "index"]);
  });

  it("builds bounded round options", () => {
    expect(roundOptions(3).map((option) => option.id)).toEqual(["current", "1", "2", "3"]);
    expect(roundOptions(0).map((option) => option.id)).toEqual(["current", "1", "2", "3", "4", "5"]);
  });

  it("installs the browser adapter", () => {
    const target = { document: { documentElement: { setAttribute: () => undefined } } } as unknown as Window;
    const adapter = installFlowActionOptionsAdapter(target);

    expect(target.PartyGameFlowActionOptions).toBe(adapter);
    expect(adapter.hostAudioPlayModeOptions()[0].id).toBe("random");
  });
});
