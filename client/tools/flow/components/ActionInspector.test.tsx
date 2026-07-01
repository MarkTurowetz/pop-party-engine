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
          onRefreshActionName: () => undefined,
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
    expect(markup).toContain('data-flow-action-refresh-name="true"');
    expect(markup).toContain("Refresh");
    expect(markup).toContain("Action Type");
    expect(markup).not.toContain("Sub-action");
    expect(markup).not.toContain("<dt>Type</dt>");
    expect(markup).not.toContain("<dt>Kind</dt>");
    expect(markup).not.toContain("<dt>State</dt>");
    expect(markup).not.toContain("<dt>Parent</dt>");
  });

  it("renders moment text-field target choices for text actions", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{
          id: "show-title",
          name: "Show Title",
          type: "presentText",
          textTarget: "presentation"
        }}
        edit={{
          onSetActionField: () => undefined,
          actionTargetOptions: [],
          textTargetOptions: [{ id: "stagePresentationText", label: "Presentation Text" }]
        }}
        state={{ id: "intro", name: "Intro", actions: [] }}
      />
    );

    expect(markup).toContain('data-flow-react-field="textTarget"');
    expect(markup).toContain("Text Field");
    expect(markup).toContain("Presentation Text");
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

  it("hides timing controls on structural jump and label nodes", () => {
    const baseProps = {
      edit: {
        onSetActionTiming: () => undefined,
        onSetActionField: () => undefined,
        actionTargetOptions: [{ id: "next", label: "Next Action" }]
      },
      state: { id: "intro", name: "Intro", actions: [] }
    };
    const jumpMarkup = renderToStaticMarkup(
      <ActionInspector
        {...baseProps}
        action={{
          id: "jump",
          name: "Jump",
          type: "jumpNode",
          timing: { mode: "E+", seconds: 10 },
          jumpTargetActionId: "next"
        }}
      />
    );
    const labelMarkup = renderToStaticMarkup(
      <ActionInspector
        {...baseProps}
        action={{
          id: "label",
          name: "Label",
          type: "labelNode",
          timing: { mode: "E+", seconds: 10 },
          labelText: "Flow note"
        }}
      />
    );

    expect(jumpMarkup).toContain('data-action-type="jumpNode"');
    expect(jumpMarkup).toContain("Jump Target");
    expect(jumpMarkup).not.toContain("Timing Mode");
    expect(jumpMarkup).not.toContain("Timing Seconds");
    expect(labelMarkup).toContain('data-action-type="labelNode"');
    expect(labelMarkup).toContain("Label Text");
    expect(labelMarkup).not.toContain("Timing Mode");
    expect(labelMarkup).not.toContain("Timing Seconds");
  });

  it("renders the add sub-action control for primary game actions", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{
          id: "show-title",
          name: "Show Title",
          type: "presentText",
          subActions: [
            { id: "sub-1", name: "Sub 1", type: "message", timing: { mode: "S+", seconds: 0.5 } }
          ]
        }}
        edit={{ onAddSubAction: () => undefined }}
        state={{ id: "intro", name: "Intro", actions: [] }}
      />
    );

    expect(markup).toContain('data-flow-react-component="sub-action-summary"');
    expect(markup).toContain("Add S+ Sub-action");
    expect(markup).not.toContain('data-flow-sub-action-id="sub-1"');
    expect(markup).not.toContain("Sub 1");
    expect(markup).toContain(">1</span>");
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
