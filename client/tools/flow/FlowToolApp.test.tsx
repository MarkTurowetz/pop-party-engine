import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowToolApp } from "./FlowToolApp";

describe("FlowToolApp shell", () => {
  it("renders a hidden legacy bridge shell with flow metadata", () => {
    const markup = renderToStaticMarkup(
      <FlowToolApp
        surface="tools"
        flow={{
          states: [{ id: "intro", name: "Intro", actions: [] }],
          routeNodes: [{ id: "entry" }]
        }}
      />
    );

    expect(markup).toContain('data-flow-react-shell="legacy-bridge"');
    expect(markup).toContain('data-state-count="1"');
    expect(markup).toContain('data-route-node-count="1"');
    expect(markup).toContain('data-surface="tools"');
    expect(markup).toContain("hidden");
  });
});
