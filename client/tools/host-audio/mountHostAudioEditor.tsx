import { createRoot, type Root } from "react-dom/client";
import type { HostAudioApi } from "../../api/hostAudioApi";
import { createHostAudioController, type HostAudioController } from "./hostAudioController";
import { HostAudioEditor } from "./HostAudioEditor";

export interface MountHostAudioEditorOptions {
  api: HostAudioApi;
  document?: Document;
  surface?: string;
  /** Reveal #hostAudioScreen (standalone /host-audio). False on /tools (router manages). */
  revealScreen?: boolean;
}

export interface MountedHostAudioEditor {
  controller: HostAudioController;
  root: Root;
  unmount: () => void;
}

export async function mountHostAudioEditor(options: MountHostAudioEditorOptions): Promise<MountedHostAudioEditor> {
  const doc = options.document || document;
  const response = await options.api.loadHostAudios();
  const controller = createHostAudioController({ initialHostAudios: response.hostAudios, api: options.api });

  const host = doc.createElement("div");
  host.id = "hostAudioEditorRoot";
  const screen = doc.querySelector("#hostAudioScreen");
  if (options.revealScreen !== false) {
    doc.body?.classList?.add("host-audio-react-replace");
    screen?.classList.remove("hidden");
  }
  if (screen) {
    for (const child of Array.from(screen.children)) {
      if (child !== host) (child as HTMLElement).style.display = "none";
    }
  }
  (screen || doc.body).appendChild(host);

  const root = createRoot(host);
  root.render(<HostAudioEditor controller={controller} surface={options.surface} />);

  return {
    controller,
    root,
    unmount: () => {
      root.unmount();
      doc.body?.classList?.remove("host-audio-react-replace");
      host.remove();
    }
  };
}
