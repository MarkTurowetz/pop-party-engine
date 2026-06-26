import { legacyScriptsForRole, type LegacyScriptRole } from "./script-manifest";

const appShellScript = "/client/app/legacy/app-shell.js";

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

export async function bootLegacySurface(role: LegacyScriptRole): Promise<void> {
  for (const script of legacyScriptsForRole(role)) {
    await loadClassicScript(script);
  }
  await loadClassicScript(appShellScript);
}
