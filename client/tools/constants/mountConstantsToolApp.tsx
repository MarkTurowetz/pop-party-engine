import { createRoot, type Root } from "react-dom/client";
import type { GameConstants } from "../../types/game-data";
import { ConstantsToolApp } from "./ConstantsToolApp";

export interface ConstantsToolReactShell {
  root: Root;
  update: (constants?: GameConstants | null, selection?: { selectedConstantId?: string }) => void;
  unmount: () => void;
}

export function mountConstantsToolApp(options: { createRoot?: (container: Element) => Pick<Root, "render" | "unmount">; document?: Document; surface?: string; visible?: boolean } = {}): ConstantsToolReactShell | null {
  const targetDocument = options.document || document;
  const visible = options.visible ?? targetDocument.defaultView?.location?.search.includes("reactConstantsPreview=1") ?? false;
  const host = targetDocument.createElement("div");
  host.id = "constantsReactShell";
  host.hidden = !visible;
  (targetDocument.querySelector?.("#constantsScreen") || targetDocument.body).appendChild(host);
  const root = (options.createRoot || createRoot)(host);
  const surface = options.surface || "constants";
  const shell = {
    root: root as Root,
    update: (constants: GameConstants | null = null, selection: { selectedConstantId?: string } = {}) => {
      root.render(<ConstantsToolApp constants={constants} selectedConstantId={selection.selectedConstantId || "gameTitle"} surface={surface} visible={visible} />);
    },
    unmount: () => {
      root.unmount();
      host.remove();
    }
  };
  shell.update(null);
  if (targetDocument.defaultView) targetDocument.defaultView.PartyGameConstantsReactShell = shell;
  return shell;
}

declare global {
  interface Window {
    PartyGameConstantsReactShell?: ConstantsToolReactShell;
  }
}
