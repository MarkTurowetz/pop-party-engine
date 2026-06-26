import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowRouteInspector } from "./FlowRouteInspector";

describe("FlowRouteInspector", () => {
  it("renders selected route node and branch metadata", () => {
    const markup = renderToStaticMarkup(
      <FlowRouteInspector
        actionTypes={[{ id: "presentText", name: "Present Text" }]}
        branch={{ id: "branch-a", type: "hit", value: "A" }}
        node={{
          id: "route-action",
          name: "Route Action",
          routeNodeType: "action",
          type: "presentText",
          branches: [{ id: "branch-a", type: "hit", value: "A" }]
        }}
      />
    );

    expect(markup).toContain('data-flow-react-component="route-inspector"');
    expect(markup).toContain('data-route-node-id="route-action"');
    expect(markup).toContain('data-route-branch-id="branch-a"');
    expect(markup).toContain("Present Text");
    expect(markup).toContain("Route Action");
  });
});
