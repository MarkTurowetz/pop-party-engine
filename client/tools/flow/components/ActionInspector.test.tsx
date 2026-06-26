import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionInspector } from "./ActionInspector";

describe("ActionInspector", () => {
  it("renders an empty state without an action", () => {
    const markup = renderToStaticMarkup(<ActionInspector action={null} state={null} />);

    expect(markup).toContain('data-flow-react-component="action-inspector"');
    expect(markup).toContain('data-empty="true"');
    expect(markup).toContain("No action selected");
  });

  it("renders selected action metadata", () => {
    const markup = renderToStaticMarkup(
      <ActionInspector
        action={{ id: "show-title", name: "Show Title", type: "presentText" }}
        isSubAction={true}
        parentAction={{ id: "parent", type: "decision" }}
        state={{ id: "intro", name: "Intro", actions: [] }}
      />
    );

    expect(markup).toContain('data-action-id="show-title"');
    expect(markup).toContain('data-action-type="presentText"');
    expect(markup).toContain('data-is-sub-action="true"');
    expect(markup).toContain('data-parent-action-id="parent"');
    expect(markup).toContain("Show Title");
  });
});
