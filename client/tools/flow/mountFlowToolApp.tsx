import { createRoot, type Root } from "react-dom/client";
import type { GameFlow } from "../../types/game-data";
import { FlowToolApp } from "./FlowToolApp";

export interface MountFlowToolAppOptions {
  document?: Document;
  flow?: GameFlow | null;
  surface?: string;
}

export function mountFlowToolApp(options: MountFlowToolAppOptions = {}): Root | null {
  const targetDocument = options.document || document;
  const host = targetDocument.createElement("div");
  host.id = "flowReactShell";
  host.hidden = true;
  targetDocument.body.appendChild(host);
  const root = createRoot(host);
  root.render(<FlowToolApp flow={options.flow || null} surface={options.surface} />);
  return root;
}
