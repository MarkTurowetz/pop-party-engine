import { createRoot, type Root } from "react-dom/client";
import type { HostAudios } from "../../types/game-data";
import { HostAudioToolApp } from "./HostAudioToolApp";

export interface HostAudioToolReactShell {
  root: Root;
  update: (hostAudios?: HostAudios | null, selection?: { selectedHostAudioId?: string; selectedLineId?: string }) => void;
  unmount: () => void;
}

export function mountHostAudioToolApp(options: { createRoot?: (container: Element) => Pick<Root, "render" | "unmount">; document?: Document; surface?: string; visible?: boolean } = {}): HostAudioToolReactShell | null {
  const targetDocument = options.document || document;
  const visible = options.visible ?? targetDocument.defaultView?.location?.search.includes("reactHostAudioPreview=1") ?? false;
  const host = targetDocument.createElement("div");
  host.id = "hostAudioReactShell";
  host.hidden = !visible;
  (targetDocument.querySelector?.("#hostAudioScreen") || targetDocument.body).appendChild(host);
  const root = (options.createRoot || createRoot)(host);
  const surface = options.surface || "host-audio";
  const shell = {
    root: root as Root,
    update: (hostAudios: HostAudios | null = null, selection: { selectedHostAudioId?: string; selectedLineId?: string } = {}) => {
      root.render(<HostAudioToolApp hostAudios={hostAudios} selectedHostAudioId={selection.selectedHostAudioId || ""} selectedLineId={selection.selectedLineId || ""} surface={surface} visible={visible} />);
    },
    unmount: () => {
      root.unmount();
      host.remove();
    }
  };
  shell.update(null);
  if (targetDocument.defaultView) targetDocument.defaultView.PartyGameHostAudioReactShell = shell;
  return shell;
}

declare global {
  interface Window {
    PartyGameHostAudioReactShell?: HostAudioToolReactShell;
  }
}
