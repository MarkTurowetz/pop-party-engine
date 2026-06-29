import manifest from "./script-manifest.json";

export type LegacyScriptRole = "stage" | "controller" | "tools" | "flow" | "layout" | "art" | "constants" | "host-audio";

const allToolScripts = [
  ...manifest.artTool,
  ...manifest.hostAudioTool,
  ...manifest.flowTool,
  ...manifest.constantsTool,
  ...manifest.layoutTool
];

const roleScripts: Record<LegacyScriptRole, string[]> = {
  stage: [...manifest.sharedFoundation, ...manifest.stageRuntime],
  controller: [...manifest.sharedFoundation, ...manifest.controllerRuntime],
  tools: [...manifest.sharedFoundation, ...manifest.stageRuntime, ...manifest.controllerRuntime, ...manifest.toolFoundation, ...allToolScripts],
  flow: [...manifest.sharedFoundation, ...manifest.toolFoundation, ...manifest.flowTool],
  layout: [...manifest.sharedFoundation, ...manifest.stageRuntime, ...manifest.toolFoundation, ...manifest.layoutTool],
  art: [...manifest.sharedFoundation, ...manifest.stageRuntime, ...manifest.toolFoundation, ...manifest.artTool],
  constants: [...manifest.sharedFoundation, ...manifest.toolFoundation, ...manifest.constantsTool],
  "host-audio": [...manifest.sharedFoundation, ...manifest.toolFoundation, ...manifest.hostAudioTool]
};

export function legacyScriptsForRole(role: LegacyScriptRole): string[] {
  return [...roleScripts[role]];
}

/** The legacy flow-tool scripts — excluded from the /tools boot now that flow is React. */
export const legacyFlowScripts: string[] = [...manifest.flowTool];

/** The legacy constants-tool scripts — excluded from /tools now that constants is React. */
export const legacyConstantsScripts: string[] = [...manifest.constantsTool];

/** The legacy host-audio-tool scripts — excluded from /tools now that host-audio is React. */
export const legacyHostAudioScripts: string[] = [...manifest.hostAudioTool];

/** The legacy art-tool scripts — excluded from /tools now that art is React. */
export const legacyArtScripts: string[] = [...manifest.artTool];
