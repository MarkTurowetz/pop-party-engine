// Typed port of the legacy client/stage/stage-text-renderer.js IIFE. Imports the
// ported PartyGameTextFit directly and installs window.PartyGameStageTextRenderer
// for the legacy stage runtime consumers.

import { PartyGameTextFit } from "./textFit";

type Dict = Record<string, unknown>;

function renderStageTextBox(target: HTMLElement | null, text: unknown, spec: Dict = {}, options: Dict = {}): Dict | null {
  if (!target) return null;
  const textValue = String(text ?? "");
  const computedStyle = window.getComputedStyle?.(target);
  const width = Number(spec.width || target.clientWidth || target.offsetWidth || 1);
  const height = Number(spec.height || target.clientHeight || target.offsetHeight || 1);
  const fontSize = Number(spec.fontSize || Number.parseFloat(computedStyle?.fontSize as string) || 24);
  const textSpec = {
    width: Math.max(1, width),
    height: Math.max(1, height),
    fontSize: Math.max(1, fontSize),
    autoFitText: spec.autoFitText !== false,
    applySize: spec.applySize === true,
    fontColor: spec.fontColor
  };
  return PartyGameTextFit.renderRuntimeText(target, textValue, textSpec, {
    autoFit: textSpec.autoFitText,
    minSize: Number(options.minSize || spec.minSize || 6),
    lineHeight: Number(options.lineHeight || spec.lineHeight || 1.05),
    ...((spec.options as Dict) || {}),
    ...options
  });
}

export const PartyGameStageTextRenderer = { renderStageTextBox };
export type PartyGameStageTextRendererApi = typeof PartyGameStageTextRenderer;

declare global {
  interface Window {
    PartyGameStageTextRenderer?: PartyGameStageTextRendererApi;
  }
}

export function installStageTextRendererGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageTextRenderer = PartyGameStageTextRenderer;
}

installStageTextRendererGlobals(typeof window !== "undefined" ? window : globalThis);
