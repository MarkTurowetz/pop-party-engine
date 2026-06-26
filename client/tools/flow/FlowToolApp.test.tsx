import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowToolApp } from "./FlowToolApp";
import { mountFlowToolApp } from "./mountFlowToolApp";

describe("FlowToolApp shell", () => {
  it("renders a hidden legacy bridge shell with flow metadata", () => {
    const markup = renderToStaticMarkup(
      <FlowToolApp
        surface="tools"
        flow={{
          states: [{ id: "intro", name: "Intro", actions: [] }],
          routeNodes: [{ id: "entry" }]
        }}
        selectedStateId="intro"
        visible={true}
      />
    );

    expect(markup).toContain('data-flow-react-shell="legacy-bridge"');
    expect(markup).toContain('data-state-count="1"');
    expect(markup).toContain('data-route-node-count="1"');
    expect(markup).toContain('data-surface="tools"');
    expect(markup).toContain('data-flow-react-component="state-list"');
    expect(markup).toContain('data-flow-react-component="action-list"');
    expect(markup).toContain('data-flow-react-component="route-node-list"');
    expect(markup).toContain('data-flow-react-component="action-inspector"');
    expect(markup).toContain('data-flow-react-component="toolbar"');
    expect(markup).not.toContain(" hidden");
  });

  it("mounts an updateable browser shell", () => {
    const hostNodes: Element[] = [];
    const defaultView = {} as Window;
    const body = {
      appendChild: (node: Element) => {
        hostNodes.push(node);
        return node;
      }
    } as unknown as HTMLElement;
    const document = {
      body,
      createElement: () => ({
        hidden: false,
        remove: () => undefined,
        set id(value: string) {
          this.setAttribute("id", value);
        },
        setAttribute: (_name: string, _value: string) => undefined
      }),
      defaultView,
      querySelector: () => null
    } as unknown as Document;
    const renders: unknown[] = [];

    const shell = mountFlowToolApp({
      createRoot: () => ({
        render: (element: unknown) => renders.push(element),
        unmount: () => undefined
      }),
      document,
      surface: "flow"
    });

    expect(shell?.update).toBeTypeOf("function");
    expect(defaultView.PartyGameFlowReactShell).toBe(shell);
    expect(hostNodes).toHaveLength(1);
    expect(renders).toHaveLength(1);
    shell?.update({ states: [], routeNodes: [] });
    expect(renders).toHaveLength(2);
    shell?.unmount();
  });
});
