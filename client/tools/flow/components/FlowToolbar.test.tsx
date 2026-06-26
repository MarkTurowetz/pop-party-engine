import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowToolbar } from "./FlowToolbar";

describe("FlowToolbar", () => {
  it("renders legacy action affordance state", () => {
    const markup = renderToStaticMarkup(
      <FlowToolbar
        canAddAction={true}
        canDelete={false}
        canRevert={true}
        flowNodeDepth="moments"
        flowViewMode="node"
      />
    );

    expect(markup).toContain('data-flow-react-component="toolbar"');
    expect(markup).toContain('data-can-add-action="true"');
    expect(markup).toContain('data-can-delete="false"');
    expect(markup).toContain('data-can-revert="true"');
    expect(markup).toContain('data-flow-node-depth="moments"');
    expect(markup).toContain('data-flow-view-mode="node"');
  });
});
