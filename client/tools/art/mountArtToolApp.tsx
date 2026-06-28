import { createRoot, type Root } from "react-dom/client";
import type { ArtAsset, ArtComposition } from "../../types/game-data";
import { ArtToolApp } from "./ArtToolApp";

export interface ArtToolReactShell {
  root: Root;
  update: (state?: ArtToolReactShellState) => void;
  unmount: () => void;
}

export interface ArtToolReactShellState {
  assets?: ArtAsset[];
  compositions?: ArtComposition[];
  selectedAssetId?: string;
  selectedComponentIds?: string[];
  selectedCompositionId?: string;
  selectedSurface?: string;
}

export function mountArtToolApp(options: { createRoot?: (container: Element) => Pick<Root, "render" | "unmount">; document?: Document; surface?: string; visible?: boolean } = {}): ArtToolReactShell | null {
  const targetDocument = options.document || document;
  const visible = options.visible ?? targetDocument.defaultView?.location?.search.includes("reactArtPreview=1") ?? false;
  const host = targetDocument.createElement("div");
  host.id = "artReactShell";
  host.hidden = !visible;
  (targetDocument.querySelector?.("#artScreen") || targetDocument.body).appendChild(host);
  const root = (options.createRoot || createRoot)(host);
  const surface = options.surface || "art";
  const shell = {
    root: root as Root,
    update: (state: ArtToolReactShellState = {}) => {
      root.render(<ArtToolApp {...state} surface={surface} visible={visible} />);
    },
    unmount: () => {
      root.unmount();
      host.remove();
    }
  };
  shell.update();
  if (targetDocument.defaultView) targetDocument.defaultView.PartyGameArtReactShell = shell;
  return shell;
}

declare global {
  interface Window {
    PartyGameArtReactShell?: ArtToolReactShell;
  }
}
