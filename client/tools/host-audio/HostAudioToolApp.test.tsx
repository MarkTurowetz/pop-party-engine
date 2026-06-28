import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HostAudioToolApp } from "./HostAudioToolApp";

describe("HostAudioToolApp shell", () => {
  it("renders a hidden legacy bridge shell with host audio metadata", () => {
    const markup = renderToStaticMarkup(
      <HostAudioToolApp
        hostAudios={{ hostAudios: [{ id: "host", name: "Host", lines: [{ id: "line", text: "Hello", url: "/hello.mp3" }] }] }}
        selectedHostAudioId="host"
        selectedLineId="line"
        visible={true}
      />
    );

    expect(markup).toContain('data-host-audio-react-shell="legacy-bridge"');
    expect(markup).toContain('data-host-audio-count="1"');
    expect(markup).toContain('data-line-count="1"');
    expect(markup).toContain("Hello");
  });
});
