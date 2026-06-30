import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HostAudioApi } from "../../api/hostAudioApi";
import type { HostAudios, HostAudiosSaveResponse } from "../../types/game-data";
import { createHostAudioController } from "./hostAudioController";
import { HostAudioEditor } from "./HostAudioEditor";

function fakeApi(): HostAudioApi {
  return {
    loadHostAudios: vi.fn(),
    saveHostAudios: vi.fn(
      async (hostAudios: HostAudios) => ({ ok: true, hostAudios, storage: {} }) as unknown as HostAudiosSaveResponse
    )
  } as HostAudioApi;
}

const initialHostAudios: HostAudios = {
  hostAudios: [
    { id: "intro", name: "Intro", lines: [{ id: "line-1", text: "Welcome", url: "/intro.mp3" }] },
    { id: "scoring", name: "Scoring", lines: [{ id: "line-2", text: "Points", url: "/scoring.mp3" }] }
  ]
};

describe("HostAudioEditor", () => {
  it("uses the shared sidebar shell and renders one selected set in the preview pane", () => {
    const controller = createHostAudioController({ initialHostAudios, api: fakeApi() });
    const markup = renderToStaticMarkup(<HostAudioEditor controller={controller} surface="tools" />);

    expect(markup).toContain('data-tool-workspace="host-audio"');
    expect(markup).toContain('data-host-audio-react-component="set-list"');
    expect(markup).toContain('data-host-audio-set-id="intro"');
    expect(markup).toContain('data-host-audio-set-id="scoring"');
    expect(markup).toContain('data-host-audio-react-component="selected-set"');
    expect(markup).toContain('data-host-audio-line-id="line-1"');
    expect(markup).not.toContain('data-host-audio-line-id="line-2"');
  });
});
