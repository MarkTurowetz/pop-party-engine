import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolWorkspace } from "./ToolWorkspace";

describe("ToolWorkspace", () => {
  it("renders a shared tool shell with sidebar, resizer, and main content", () => {
    const markup = renderToStaticMarkup(
      <ToolWorkspace
        dataAttributes={{ "sample-state": "ready" }}
        header={<h2>Selected Thing</h2>}
        sidebar={<button type="button">Sidebar Item</button>}
        sidebarLabel="Sample sidebar"
        title="Sample Tool"
        toolbar={<button type="button">Save</button>}
        toolId="sample"
      >
        <section>Main Content</section>
      </ToolWorkspace>
    );

    expect(markup).toContain('data-tool-workspace="sample"');
    expect(markup).toContain('data-sample-state="ready"');
    expect(markup).toContain('class="tool-workspace-header"');
    expect(markup).toContain('class="tool-workspace-sidebar"');
    expect(markup).toContain('class="tool-panel-resizer tool-workspace-resizer"');
    expect(markup).toContain('class="tool-workspace-main"');
    expect(markup).toContain("Selected Thing");
    expect(markup).toContain("Sidebar Item");
    expect(markup).toContain("Main Content");
  });
});
