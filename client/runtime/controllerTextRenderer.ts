// Typed port of the legacy client/controller-text-renderer.js IIFE. Imports the
// ported PartyGameTextFit directly and installs window.PartyGameControllerText for
// the legacy controller runtime.

import { PartyGameTextFit } from "./textFit";

type Dict = Record<string, unknown>;

function measureTarget(target: HTMLElement | null, spec: Dict = {}): Dict {
  const rect = target?.getBoundingClientRect?.() || ({} as DOMRect);
  const computed = typeof window.getComputedStyle === "function" && target ? window.getComputedStyle(target) : null;
  return {
    width: Number(spec.width || rect.width || target?.clientWidth || 240),
    height: Number(spec.height || rect.height || target?.clientHeight || 58),
    fontSize: Number(spec.fontSize || Number.parseFloat(computed?.fontSize as string) || 24),
    fontColor: spec.fontColor || computed?.color || "currentColor",
    autoFitText: spec.autoFitText !== false,
    applySize: spec.applySize === true
  };
}

function setText(target: HTMLElement | null, value: unknown, spec: Dict = {}): void {
  if (!target) return;
  const text = String(value ?? "");
  PartyGameTextFit.renderRuntimeText(target, text, measureTarget(target, spec), (spec.options as Dict) || {});
}

function setButtonText(target: HTMLElement | null, value: unknown, spec: Dict = {}): void {
  setText(target, value, { ...spec, applySize: false });
}

export const PartyGameControllerText = { setText, setButtonText };
export type PartyGameControllerTextApi = typeof PartyGameControllerText;

declare global {
  interface Window {
    PartyGameControllerText?: PartyGameControllerTextApi;
  }
}

export function installControllerTextGlobals(target: Window | typeof globalThis = globalThis): void {
  const host = target as Window;
  host.PartyGameControllerText = { ...(host.PartyGameControllerText || {}), ...PartyGameControllerText };
}

installControllerTextGlobals(typeof window !== "undefined" ? window : globalThis);
