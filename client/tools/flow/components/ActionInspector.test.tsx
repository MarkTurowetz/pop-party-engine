import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionInspector } from "./ActionInspector";

describe("ActionInspector", () => {
  it("renders an empty state without an action", () => {
    const markup = renderToStaticMarkup(<ActionInspector action={null} state={null} />);

    expect(markup).toContain('data-flow-react-component="action-inspector"');
    expect(markup).toContain('data-empty="true"');
    expect(markup).toContain("No state selected");
  });

  it("renders selected state metadata when no action is selected", () => {
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
    expect(markup).toContain("State");
    expect(markup).toContain("round-one");
  });

  it("renders selected action metadata", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{ id: "show-title", name: "Show Title", type: "presentText", timing: { mode: "E+", seconds: 1.5 } }}
        actionTypes={[{ id: "presentText", name: "Present Text" }]}
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
    expect(markup).toContain("Sub-action");
    expect(markup).toContain("Parent");
    expect(markup).toContain("E+ 1.50s");
  });
});
