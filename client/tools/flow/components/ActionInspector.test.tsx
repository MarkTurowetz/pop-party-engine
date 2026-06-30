import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionInspector } from "./ActionInspector";

describe("ActionInspector", () => {
  it("renders an empty subroutine without an action", () => {
    const markup = renderToStaticMarkup(<ActionInspector action={null} state={null} />);

    expect(markup).toContain('data-flow-react-component="action-inspector"');
    expect(markup).toContain('data-empty="true"');
    expect(markup).toContain("No subroutine selected");
  });

  it("renders selected subroutine metadata when no action is selected", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={null}
        state={{
          id: "intro",
          name: "Intro",
          actions: [{ id: "show", type: "presentText" }],
          entryTargetActionId: "show",
          nextStateTargetId: "round-one"
        }}
      />
    );

    expect(markup).toContain('data-state-id="intro"');
    expect(markup).toContain("Intro");
    expect(markup).toContain("Subroutine");
    expect(markup).toContain("round-one");
  });

  it("renders selected action fields without metadata clutter", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{
          id: "show-title",
          name: "Show Title",
          type: "presentText",
          timing: { mode: "E+", seconds: 1.5 }
        }}
        edit={{
          onRenameAction: () => undefined,
          onSetActionType: () => undefined,
          actionTypeOptions: [{ id: "presentText", label: "Present Text" }]
        }}
        isSubAction={true}
        parentAction={{ id: "parent", name: "Parent", type: "decision" }}
        state={{ id: "intro", name: "Intro", actions: [] }}
      />
    );

    expect(markup).toContain('data-action-id="show-title"');
    expect(markup).toContain('data-action-type="presentText"');
    expect(markup).toContain('data-is-sub-action="true"');
    expect(markup).toContain('data-parent-action-id="parent"');
    expect(markup).toContain("Show Title");
    expect(markup).toContain("Present Text");
    expect(markup).toContain("Name");
    expect(markup).toContain("Action Type");
    expect(markup).not.toContain("Sub-action");
    expect(markup).not.toContain("<dt>Type</dt>");
    expect(markup).not.toContain("<dt>Kind</dt>");
    expect(markup).not.toContain("<dt>State</dt>");
    expect(markup).not.toContain("<dt>Parent</dt>");
  });

  it("hides timing controls and bundled branch fields on decision actions", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{
          id: "decision",
          name: "Decision",
          type: "decision",
          timing: { mode: "E+", seconds: 1 },
          branches: [{ id: "hit", type: "hit", value: "3", targetActionId: "next" }]
        }}
        edit={{
          onSetActionTiming: () => undefined,
          onSetActionField: () => undefined,
          decision: { onAddBranch: () => undefined },
          actionTargetOptions: [{ id: "next", label: "Next" }]
        }}
        state={{ id: "intro", name: "Intro", actions: [] }}
      />
    );

    expect(markup).toContain('data-action-type="decision"');
    expect(markup).toContain("Decision Branches");
    expect(markup).toContain("Add Branch");
    expect(markup).not.toContain("Timing Mode");
    expect(markup).not.toContain("Timing Seconds");
    expect(markup).not.toContain("Hit 3");
    expect(markup).not.toContain("Target");
  });

  it("renders selected decision branch parameters in their own inspector", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{ id: "hit", type: "hit", value: "3", targetActionId: "next" }}
        edit={{
          decision: {
            onRemoveBranch: () => undefined,
            onSetBranchField: () => undefined
          },
          actionTargetOptions: [{ id: "next", label: "Next Action" }]
        }}
        isBranch={true}
        parentAction={{ id: "decision", name: "Decision", type: "decision" }}
        state={{ id: "intro", name: "Intro", actions: [] }}
      />
    );

    expect(markup).toContain('data-flow-react-component="decision-branch-inspector"');
    expect(markup).toContain("Decision Branch");
    expect(markup).toContain("Branch Type");
    expect(markup).toContain("Value");
    expect(markup).toContain("Target");
    expect(markup).toContain("Next Action");
    expect(markup).toContain("Remove Branch");
  });
});
