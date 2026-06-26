import { legacyScriptsForRole, type LegacyScriptRole } from "./script-manifest";

const appShellScript = "/client/app/legacy/app-shell.js";

export interface BootLegacySurfaceOptions {
  excludeScripts?: string[];
}

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-legacy-src="${src}"]`);
    if (existing?.getAttribute("data-loaded") === "true") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.legacySrc = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error(`Failed to load legacy script: ${src}`));
    }, { once: true });
    document.body.appendChild(script);
  });
}

export async function bootLegacySurface(role: LegacyScriptRole, options: BootLegacySurfaceOptions = {}): Promise<void> {
  const excludedScripts = new Set(options.excludeScripts || []);
  for (const script of legacyScriptsForRole(role)) {
    if (excludedScripts.has(script)) continue;
    await loadClassicScript(script);
  }
  await loadClassicScript(appShellScript);
}
