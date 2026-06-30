import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowToolbar } from "./FlowToolbar";

describe("FlowToolbar", () => {
  it("renders legacy action affordance state", () => {
    const markup = renderToStaticMarkup(
      <FlowToolbar
        canAddAction={true}
        canAddState={true}
        canDelete={false}
        canRedo={true}
        canRevert={true}
        canSave={true}
        canUndo={true}
        flowNodeDepth="moments"
        flowViewMode="node"
      />
    );

    expect(markup).toContain('data-flow-react-component="toolbar"');
    expect(markup).toContain('data-can-add-action="true"');
    expect(markup).toContain('data-can-add-state="true"');
    expect(markup).toContain('data-can-delete="false"');
    expect(markup).toContain('data-can-redo="true"');
    expect(markup).toContain('data-can-revert="true"');
    expect(markup).toContain('data-can-save="true"');
    expect(markup).toContain('data-can-undo="true"');
    expect(markup).toContain('data-flow-node-depth="moments"');
    expect(markup).toContain('data-flow-view-mode="node"');
  });
});
