import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowActionList } from "./FlowActionList";
import { FlowStateList } from "./FlowStateList";

describe("Flow React list components", () => {
  it("renders states with selection and action counts", () => {
    const markup = renderToStaticMarkup(
      <FlowStateList
        selectedStateId="round-one"
        states={[
          { id: "intro", name: "Intro", actions: [] },
          { id: "round-one", name: "Round One", actions: [{ id: "show", type: "presentText" }] }
        ]}
      />
    );

    expect(markup).toContain('data-flow-react-component="state-list"');
    expect(markup).toContain('data-state-id="round-one"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain(">1</span>");
  });

  it("renders actions with type metadata and sub-action counts", () => {
    const markup = renderToStaticMarkup(
      <FlowActionList
        selectedActionId="show"
        actions={[
          { id: "show", name: "Show Title", type: "presentText", subActions: [{ id: "sub", type: "displayText" }] },
          { id: "jump", type: "jumpNode" }
        ]}
      />
    );

    expect(markup).toContain('data-flow-react-component="action-list"');
    expect(markup).toContain('data-action-id="show"');
    expect(markup).toContain('data-action-type="presentText"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain(">1</span>");
  });
});
