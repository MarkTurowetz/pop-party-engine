import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowRouteNodeList } from "./FlowRouteNodeList";

describe("FlowRouteNodeList", () => {
  it("renders route node metadata and selection", () => {
    const markup = renderToStaticMarkup(
      <FlowRouteNodeList
        routeNodes={[
          { id: "entry", routeNodeType: "momentEntry", name: "Entry" },
          {
            id: "action",
            routeNodeType: "action",
            name: "Action",
            branches: [{ id: "branch-a", type: "hit", value: "A" }]
          }
        ]}
        selectedRouteBranchId="branch-a"
        selectedRouteNodeId="action"
      />
    );

    expect(markup).toContain('data-flow-react-component="route-node-list"');
    expect(markup).toContain('data-route-node-id="action"');
    expect(markup).toContain('data-route-node-type="action"');
    expect(markup).toContain('data-route-branch-id="branch-a"');
    expect(markup).toContain('aria-current="true"');
  });
});
