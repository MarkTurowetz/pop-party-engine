export const gameTextDefaultFontFamily = 'ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif';

export const gameTextFontOptions = [
  { value: gameTextDefaultFontFamily, label: "Game UI" },
  { value: '"Avenir Next", Avenir, system-ui, sans-serif', label: "Avenir Next" },
  { value: '"Trebuchet MS", "Avenir Next", system-ui, sans-serif', label: "Trebuchet MS" },
  { value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', label: "Impact" },
  { value: 'Georgia, "Times New Roman", serif', label: "Georgia" },
  { value: '"Courier New", Courier, monospace', label: "Courier New" }
] as const;

const gameTextFontValues = new Set<string>(gameTextFontOptions.map((option) => option.value));

export function normalizeGameTextFontFamily(value: unknown, fallback: unknown = gameTextDefaultFontFamily): string {
  const text = String(value || "").trim();
  if (gameTextFontValues.has(text)) return text;
  const fallbackText = String(fallback || "").trim();
  if (gameTextFontValues.has(fallbackText)) return fallbackText;
  return gameTextDefaultFontFamily;
}
