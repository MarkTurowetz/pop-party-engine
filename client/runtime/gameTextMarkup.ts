const ALLOWED_TAG = /<\/?(?:br|strong|b|em|i|u|s|sub|sup)\s*\/?>/gi;
const ALLOWED_TOKEN = /(<\/?(?:br|strong|b|em|i|u|s|sub|sup)\s*\/?>|&(?:#\d+|#x[\da-f]+|[a-z][\w]+);)/gi;

function normalizedAllowedTag(tag: string): string {
  const closing = /^<\//.test(tag);
  const name = tag.match(/^<\/?\s*([a-z]+)/i)?.[1]?.toLowerCase() || "";
  if (name === "br") return "<br />";
  return closing ? `</${name}>` : `<${name}>`;
}

export function normalizeGameTextMarkup(value: unknown): string {
  return String(value ?? "").replace(/\\n/g, "\n");
}

export function transformGameTextMarkup(value: unknown, transform: unknown): string {
  const text = normalizeGameTextMarkup(value);
  if (!transform || transform === "none") return text;
  return text
    .split(ALLOWED_TOKEN)
    .map((part) => {
      if (!part || /^<|^&/.test(part)) return part;
      if (transform === "uppercase") return part.toUpperCase();
      if (transform === "lowercase") return part.toLowerCase();
      if (transform === "capitalize") return part.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
      return part;
    })
    .join("");
}

function decodeEntity(entity: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  const body = entity.slice(1, -1);
  if (body[0] === "#") {
    const hexadecimal = body[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }
  }
  return named[body.toLowerCase()] || entity;
}

export function gameTextPlainText(value: unknown): string {
  return normalizeGameTextMarkup(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(ALLOWED_TAG, "")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/gi, decodeEntity);
}

export function gameTextHtml(value: unknown): string {
  const tokens: string[] = [];
  const tokenized = normalizeGameTextMarkup(value).replace(ALLOWED_TOKEN, (token) => {
    tokens.push(token.startsWith("<") ? normalizedAllowedTag(token) : token);
    return `\ue000${tokens.length - 1}\ue001`;
  });
  return tokenized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br />")
    .replace(/\ue000(\d+)\ue001/g, (_match, index) => tokens[Number(index)] || "");
}

export function setGameTextHtml(target: HTMLElement, value: unknown): void {
  const html = gameTextHtml(value);
  if (target.innerHTML !== html) target.innerHTML = html;
  // Lightweight runtime test doubles do not implement the DOM relationship
  // between innerHTML and textContent. Keep their observable text equivalent
  // without changing real browser markup.
  if (!target.ownerDocument) target.textContent = gameTextPlainText(value);
}
