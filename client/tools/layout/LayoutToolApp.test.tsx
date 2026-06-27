import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutToolApp } from "./LayoutToolApp";
import { mountLayoutToolApp } from "./mountLayoutToolApp";

describe("LayoutToolApp shell", () => {
  it("renders a hidden legacy bridge shell with layout metadata", () => {
    const markup = renderToStaticMarkup(
      <LayoutToolApp
        layouts={{
          canvas: { width: 1920, height: 1080 },
          global: { id: "global", name: "Global", elements: [{ id: "logo", name: "Logo", kind: "art" }] },
          states: [{ id: "intro", name: "Intro", elements: [] }]
        }}
        selectedElementIds={["logo"]}
        selectedStateId="global"
        visible={true}
      />
    );

    expect(markup).toContain('data-layout-react-shell="legacy-bridge"');
    expect(markup).toContain('data-layout-group-count="2"');
    expect(markup).toContain('data-layout-selected-count="1"');
    expect(markup).toContain('data-layout-react-component="group-list"');
    expect(markup).toContain('data-layout-react-component="element-list"');
    expect(markup).toContain("1920 x 1080");
  });

  it("mounts an updateable browser shell with handlers", () => {
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

    const shell = mountLayoutToolApp({
      createRoot: () => ({
        render: (element: unknown) => renders.push(element),
        unmount: () => undefined
      }),
      document,
      surface: "layout"
    });

    expect(shell?.update).toBeTypeOf("function");
    expect(shell?.setHandlers).toBeTypeOf("function");
    expect(defaultView.PartyGameLayoutReactShell).toBe(shell);
    expect(hostNodes).toHaveLength(1);
    shell?.setHandlers({ selectState: () => undefined });
    expect(renders).toHaveLength(2);
    shell?.unmount();
  });
});
