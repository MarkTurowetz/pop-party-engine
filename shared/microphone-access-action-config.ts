// Dual-use (server require + client global) microphone-access action config. Built to
// shared/microphone-access-action-config.js via `npm run build:shared` (committed output).

(function (root: Record<string, unknown>, factory: () => unknown): void {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PartyMicrophoneAccessActions = api;
  }
})((typeof globalThis !== "undefined" ? globalThis : window) as unknown as Record<string, unknown>, function () {
  "use strict";

  type ActionOrType = string | { type?: string } | null | undefined;

  interface MicrophoneAccessConfig {
    mode: string;
    prompt: string;
    buttonLabel: string;
  }

  const MICROPHONE_ACCESS_ACTION_CONFIGS: Record<string, MicrophoneAccessConfig> = {
    requestMicrophoneAccessInput: {
      mode: "vip",
      prompt: "Give microphone access to the game",
      buttonLabel: "Yes"
    }
  };

  function microphoneAccessActionConfig(actionOrType: ActionOrType): MicrophoneAccessConfig | null {
    const type = typeof actionOrType === "string" ? actionOrType : actionOrType?.type;
    return (type != null ? MICROPHONE_ACCESS_ACTION_CONFIGS[type] : null) || null;
  }

  function isMicrophoneAccessAction(actionOrType: ActionOrType): boolean {
    return Boolean(microphoneAccessActionConfig(actionOrType));
  }

  function normalizeMicrophoneAccessMode(value: unknown): string {
    return value === "all" ? "all" : "vip";
  }

  return {
    MICROPHONE_ACCESS_ACTION_CONFIGS,
    isMicrophoneAccessAction,
    microphoneAccessActionConfig,
    normalizeMicrophoneAccessMode
  };
});
